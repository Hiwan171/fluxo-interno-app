"use server";

import { revalidatePath } from "next/cache";

import { CUSTOM_FIELD_NAME_PREFIX } from "@/components/app/custom-field-mapping";
import type { FormSubmitResult, KanbanCardDTO } from "@/components/app/types";
import {
  assertSubmissionWithinLimits,
  AttachmentValidationError,
  commitUploadedFiles,
  discardPendingFiles,
  saveUploadedFile,
  type UploadedFileMeta,
} from "@/lib/attachments";
import type { ContractFieldErrors } from "@/lib/contracts/fields";
import {
  ContractValidationError,
  generateContractForCurrentUser,
  prepareContractForCurrentUser,
  type ContractPreparation,
} from "@/lib/contracts/service";
import {
  archiveCardForCurrentUser,
  assignCardForCurrentUser,
  AuthorizationError,
  ConflictError,
  createCardForCurrentUser,
  createCommentForCurrentUser,
  createPhaseForCurrentUser,
  deletePhaseForCurrentUser,
  duplicateCardForCurrentUser,
  getCardActivityForCurrentUser,
  movePhaseForCurrentUser,
  moveCardForCurrentUser,
  ResourceNotFoundError,
  searchBoardCardsForCurrentUser,
  sendCardEmailForCurrentUser,
  unassignCardForCurrentUser,
  updateCardForCurrentUser,
  updatePhaseForCurrentUser,
} from "@/lib/dal";
import { buildKanbanCards } from "@/lib/card-dto";
import { FieldValidationError } from "@/lib/field-values";
import { cardPrioritySchema } from "@/lib/validation";

type ExtractedFieldValues = {
  values: Record<string, unknown>;
  pendingFiles: UploadedFileMeta[];
};

/**
 * Os arquivos ficam em área temporária até a transação do card ser confirmada;
 * quem chama precisa promover com `commitUploadedFiles` ou limpar com
 * `discardPendingFiles`.
 */
async function extractCustomFieldValues(
  formData: FormData,
): Promise<ExtractedFieldValues> {
  const values: Record<string, unknown> = {};
  const fileEntriesByField = new Map<string, File[]>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(CUSTOM_FIELD_NAME_PREFIX)) continue;
    const fieldId = key.slice(CUSTOM_FIELD_NAME_PREFIX.length);

    if (value instanceof File) {
      if (value.size === 0 && !value.name) continue;
      const list = fileEntriesByField.get(fieldId) ?? [];
      list.push(value);
      fileEntriesByField.set(fieldId, list);
      continue;
    }

    values[fieldId] = value === "true" ? true : value === "false" ? false : value;
  }

  assertSubmissionWithinLimits(
    Array.from(fileEntriesByField.values()).flat(),
  );

  const pendingFiles: UploadedFileMeta[] = [];

  try {
    for (const [fieldId, files] of fileEntriesByField) {
      const uploaded = await Promise.all(
        files.map((file) => saveUploadedFile(file)),
      );
      pendingFiles.push(...uploaded);
      values[fieldId] = { kind: "attachment", files: uploaded };
    }
  } catch (error) {
    await discardPendingFiles(pendingFiles);
    throw error;
  }

  return { values, pendingFiles };
}

/**
 * O Next substitui a mensagem de erros lançados de server actions em produção,
 * para não vazar detalhe interno ao cliente. Por isso estas ações devolvem o
 * texto em vez de lançar: é a única forma de o usuário ler o motivo real —
 * "a fase atingiu o limite", e não "algo deu errado".
 */
function describeActionFailure(
  error: unknown,
  fallback: string,
): FormSubmitResult {
  if (
    error instanceof ConflictError ||
    error instanceof AuthorizationError ||
    error instanceof FieldValidationError
  ) {
    return { error: error.message };
  }

  return { error: fallback };
}

export async function moveCardAction(
  boardId: string,
  input: { cardId: string; destinationPhaseId: string; position: number },
): Promise<FormSubmitResult> {
  try {
    await moveCardForCurrentUser(input);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível mover o card.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function createCardAction(
  boardId: string,
  phaseId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const title = String(formData.get("title") ?? "").trim();

  if (!title) {
    return { error: "Informe um título para o card." };
  }

  const priorityInput = String(formData.get("priority") ?? "medium");
  const priorityResult = cardPrioritySchema.safeParse(priorityInput);
  const dueAtValue = String(formData.get("dueAt") ?? "").trim();

  let pendingFiles: UploadedFileMeta[] = [];

  try {
    const extracted = await extractCustomFieldValues(formData);
    pendingFiles = extracted.pendingFiles;

    await createCardForCurrentUser({
      boardId,
      phaseId,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      priority: priorityResult.success ? priorityResult.data : "medium",
      dueAt: dueAtValue || null,
      fieldValues: extracted.values,
    });

    await commitUploadedFiles(pendingFiles);
  } catch (error) {
    await discardPendingFiles(pendingFiles);

    if (
      error instanceof AttachmentValidationError ||
      error instanceof FieldValidationError ||
      error instanceof ConflictError
    ) {
      return { error: error.message };
    }
    return { error: "Não foi possível criar o card." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function updateCardAction(
  boardId: string,
  cardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const title = String(formData.get("title") ?? "").trim();

  if (!title) {
    return { error: "Informe um título para o card." };
  }

  const priorityInput = String(formData.get("priority") ?? "medium");
  const priorityResult = cardPrioritySchema.safeParse(priorityInput);
  const dueAtValue = String(formData.get("dueAt") ?? "").trim();

  let pendingFiles: UploadedFileMeta[] = [];

  try {
    const extracted = await extractCustomFieldValues(formData);
    pendingFiles = extracted.pendingFiles;

    await updateCardForCurrentUser(cardId, {
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      priority: priorityResult.success ? priorityResult.data : "medium",
      dueAt: dueAtValue || null,
      fieldValues: extracted.values,
    });

    await commitUploadedFiles(pendingFiles);
  } catch (error) {
    await discardPendingFiles(pendingFiles);

    if (
      error instanceof AttachmentValidationError ||
      error instanceof FieldValidationError ||
      error instanceof ConflictError
    ) {
      return { error: error.message };
    }
    return { error: "Não foi possível salvar as alterações." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function duplicateCardAction(boardId: string, cardId: string): Promise<FormSubmitResult> {
  try {
    await duplicateCardForCurrentUser(cardId);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível duplicar o card.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function archiveCardAction(boardId: string, cardId: string): Promise<FormSubmitResult> {
  try {
    await archiveCardForCurrentUser(cardId);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível arquivar o card.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function createPhaseAction(
  boardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Informe um nome para a fase." };
  }

  const colorValue = String(formData.get("color") ?? "").trim();
  const cardLimitRaw = String(formData.get("cardLimit") ?? "").trim();

  try {
    await createPhaseForCurrentUser({
      boardId,
      name,
      color: colorValue || null,
      cardLimit: cardLimitRaw ? Number(cardLimitRaw) : null,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        error: "Você não tem permissão para criar fases neste quadro.",
      };
    }
    return { error: "Não foi possível criar a fase." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function updatePhaseAction(
  boardId: string,
  phaseId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Informe um nome para a fase." };
  }

  const colorValue = String(formData.get("color") ?? "").trim();
  const cardLimitRaw = String(formData.get("cardLimit") ?? "").trim();

  try {
    await updatePhaseForCurrentUser(phaseId, {
      name,
      color: colorValue || null,
      cardLimit: cardLimitRaw ? Number(cardLimitRaw) : null,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: "Você não tem permissão para editar esta fase." };
    }
    return { error: "Não foi possível salvar as alterações." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function deletePhaseAction(
  boardId: string,
  phaseId: string,
): Promise<FormSubmitResult> {
  try {
    await deletePhaseForCurrentUser(phaseId);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível excluir a fase.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function movePhaseAction(
  boardId: string,
  phaseId: string,
  direction: "left" | "right",
): Promise<FormSubmitResult> {
  try {
    await movePhaseForCurrentUser(phaseId, direction);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível mover a fase.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function getCardActivityAction(cardId: string) {
  const activity = await getCardActivityForCurrentUser(cardId);

  return {
    comments: activity.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorId: comment.authorId,
      authorName: comment.authorName ?? "Usuário removido",
      authorAvatarUrl: comment.authorAvatarUrl,
      createdAt: comment.createdAt.toISOString(),
    })),
    emails: activity.emails.map((email) => ({
      id: email.id,
      status: email.status,
      fromAddress: email.fromAddress,
      toAddresses: email.toAddresses,
      subject: email.subject,
      textBody: email.textBody,
      errorMessage: email.errorMessage,
      isAutomated: email.templateId !== null,
      sentAt: email.sentAt ? email.sentAt.toISOString() : null,
      createdAt: email.createdAt.toISOString(),
    })),
    history: activity.history.map((entry) => ({
      id: entry.id,
      type: entry.type,
      metadata: entry.metadata,
      // Sem ator significa origem anônima — um envio pelo formulário público.
      actorName: entry.actorId ? (entry.actorName ?? "Usuário removido") : null,
      actorAvatarUrl: entry.actorAvatarUrl,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  };
}

export async function assignCardAction(
  boardId: string,
  cardId: string,
  userId: string,
): Promise<FormSubmitResult> {
  try {
    await assignCardForCurrentUser(cardId, userId);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível atribuir o responsável.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function unassignCardAction(
  boardId: string,
  cardId: string,
  userId: string,
): Promise<FormSubmitResult> {
  try {
    await unassignCardForCurrentUser(cardId, userId);
  } catch (error) {
    return describeActionFailure(error, "Não foi possível remover o responsável.");
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function addCommentAction(
  boardId: string,
  cardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Escreva um comentário antes de enviar." };
  }

  try {
    await createCommentForCurrentUser({ cardId, body });
  } catch {
    return { error: "Não foi possível adicionar o comentário." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function sendCardEmailAction(
  boardId: string,
  cardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const toRaw = String(formData.get("to") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!toRaw || !subject || !body) {
    return { error: "Preencha destinatário, assunto e mensagem." };
  }

  const toAddresses = toRaw
    .split(/[,;\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    await sendCardEmailForCurrentUser({ cardId, toAddresses, subject, body });
  } catch (error) {
    if (error instanceof ConflictError) {
      return { error: error.message };
    }
    return { error: "Não foi possível enviar o e-mail. Verifique os endereços informados." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export type BoardSearchResult = {
  cards: KanbanCardDTO[];
};

/**
 * Busca em todo o quadro, não só nos cards carregados.
 *
 * O kanban traz no máximo 100 cards por fase; filtrar no cliente deixaria de
 * fora exatamente os cards antigos que alguém está procurando.
 */
export async function searchBoardCardsAction(
  boardId: string,
  query: string,
): Promise<BoardSearchResult> {
  const { cards, extras, expirationMinutes } =
    await searchBoardCardsForCurrentUser(boardId, query);

  return { cards: buildKanbanCards(cards, extras, expirationMinutes) };
}

export type PrepareContractResult =
  | { ok: true; data: ContractPreparation }
  | { ok: false; error: string };

export type GenerateContractResult =
  | { success: true; attachmentId: string; fileName: string }
  | { success?: false; error: string; fieldErrors?: ContractFieldErrors };

function describeContractFailure(error: unknown, fallback: string): string {
  if (error instanceof AuthorizationError) {
    return "Você não tem permissão para gerar contratos neste card.";
  }

  if (
    error instanceof ConflictError ||
    error instanceof ResourceNotFoundError ||
    error instanceof AttachmentValidationError
  ) {
    return error.message;
  }

  return fallback;
}

/** Rascunho do contrato a partir do card, para a tela de revisão. */
export async function prepareContractAction(
  cardId: string,
): Promise<PrepareContractResult> {
  try {
    return { ok: true, data: await prepareContractForCurrentUser(cardId) };
  } catch (error) {
    return {
      ok: false,
      error: describeContractFailure(
        error,
        "Não foi possível preparar o contrato deste card.",
      ),
    };
  }
}

/** Gera o PDF a partir do que foi revisado e o anexa ao card. */
export async function generateContractAction(
  boardId: string,
  cardId: string,
  fields: unknown,
): Promise<GenerateContractResult> {
  try {
    const { attachmentId, fileName } = await generateContractForCurrentUser(
      cardId,
      fields,
    );

    revalidatePath(`/boards/${boardId}`);

    return { success: true, attachmentId, fileName };
  } catch (error) {
    if (error instanceof ContractValidationError) {
      return { error: error.message, fieldErrors: error.fieldErrors };
    }

    return {
      error: describeContractFailure(error, "Não foi possível gerar o contrato."),
    };
  }
}
