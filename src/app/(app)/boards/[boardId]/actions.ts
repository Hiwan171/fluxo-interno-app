"use server";

import { revalidatePath } from "next/cache";

import { CUSTOM_FIELD_NAME_PREFIX } from "@/components/app/custom-field-mapping";
import type { FormSubmitResult } from "@/components/app/types";
import {
  archiveCardForCurrentUser,
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
  sendCardEmailForCurrentUser,
  updateCardForCurrentUser,
  updatePhaseForCurrentUser,
} from "@/lib/dal";
import { cardPrioritySchema } from "@/lib/validation";

function extractCustomFieldValues(formData: FormData) {
  const values: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(CUSTOM_FIELD_NAME_PREFIX)) continue;
    const fieldId = key.slice(CUSTOM_FIELD_NAME_PREFIX.length);
    values[fieldId] = value === "true" ? true : value === "false" ? false : value;
  }

  return values;
}

export async function moveCardAction(
  boardId: string,
  input: { cardId: string; destinationPhaseId: string; position: number },
) {
  await moveCardForCurrentUser(input);
  revalidatePath(`/boards/${boardId}`);
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

  try {
    await createCardForCurrentUser({
      boardId,
      phaseId,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      priority: priorityResult.success ? priorityResult.data : "medium",
      dueAt: dueAtValue || null,
      fieldValues: extractCustomFieldValues(formData),
    });
  } catch {
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

  try {
    await updateCardForCurrentUser(cardId, {
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      priority: priorityResult.success ? priorityResult.data : "medium",
      dueAt: dueAtValue || null,
      fieldValues: extractCustomFieldValues(formData),
    });
  } catch {
    return { error: "Não foi possível salvar as alterações." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { success: true };
}

export async function duplicateCardAction(boardId: string, cardId: string) {
  await duplicateCardForCurrentUser(cardId);
  revalidatePath(`/boards/${boardId}`);
}

export async function archiveCardAction(boardId: string, cardId: string) {
  await archiveCardForCurrentUser(cardId);
  revalidatePath(`/boards/${boardId}`);
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

export async function deletePhaseAction(boardId: string, phaseId: string) {
  try {
    await deletePhaseForCurrentUser(phaseId);
  } catch (error) {
    if (error instanceof ConflictError || error instanceof AuthorizationError) {
      throw new Error(error.message);
    }
    throw new Error("Não foi possível excluir a fase.");
  }

  revalidatePath(`/boards/${boardId}`);
}

export async function movePhaseAction(
  boardId: string,
  phaseId: string,
  direction: "left" | "right",
) {
  await movePhaseForCurrentUser(phaseId, direction);
  revalidatePath(`/boards/${boardId}`);
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
      toAddresses: email.toAddresses,
      subject: email.subject,
      textBody: email.textBody,
      errorMessage: email.errorMessage,
      sentAt: email.sentAt ? email.sentAt.toISOString() : null,
      createdAt: email.createdAt.toISOString(),
    })),
  };
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
