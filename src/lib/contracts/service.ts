import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { attachments, cardFieldValues, customFields } from "@/db/schema";
import {
  commitUploadedFiles,
  discardPendingFiles,
  saveUploadedFile,
} from "@/lib/attachments";
import {
  CONTRACT_COMPANIES,
  CONTRACT_COMPANY_KEYS,
  companyKinds,
  type ContractKind,
} from "@/lib/contracts/companies";
import {
  buildContractDocument,
  ContractCompanyNotReadyError,
} from "@/lib/contracts/compose";
import {
  collectFieldErrors,
  contractFieldsSchema,
  type ContractFieldErrors,
} from "@/lib/contracts/fields";
import {
  buildContractDraft,
  supportsContractGeneration,
  toCardValues,
  type ContractDraft,
} from "@/lib/contracts/from-card";
import { renderContractPdf } from "@/lib/contracts/pdf";
import { ConflictError, requireCardEditAccess } from "@/lib/dal";
import { CARD_EVENT_TYPES, recordCardEvent } from "@/lib/events";

/** Dados inválidos na tela de revisão; carrega o erro de cada campo. */
export class ContractValidationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: ContractFieldErrors,
  ) {
    super(message);
    this.name = "ContractValidationError";
  }
}

export type ContractPreparation = ContractDraft & {
  companies: Array<{
    key: string;
    name: string;
    ready: boolean;
    /** Tipos de contrato para os quais há contrato de referência. */
    kinds: ContractKind[];
  }>;
  existing: Array<{
    id: string;
    fileName: string;
    sizeBytes: number;
    createdAt: string;
  }>;
};

async function loadBoardFields(boardId: string) {
  return getDb()
    .select({ id: customFields.id, label: customFields.label })
    .from(customFields)
    .where(and(eq(customFields.boardId, boardId), eq(customFields.isArchived, false)));
}

/**
 * Rascunho do contrato a partir do card, mais o que a tela de revisão precisa
 * (empresas disponíveis e contratos já gerados para este card).
 */
export async function prepareContractForCurrentUser(
  cardId: string,
): Promise<ContractPreparation> {
  const { card } = await requireCardEditAccess(cardId);
  const definitions = await loadBoardFields(card.boardId);

  if (!supportsContractGeneration(definitions.map((field) => field.label))) {
    throw new ConflictError(
      "Este quadro não tem os campos necessários para gerar contratos.",
    );
  }

  const [values, existing] = await Promise.all([
    getDb()
      .select({
        customFieldId: cardFieldValues.customFieldId,
        value: cardFieldValues.value,
      })
      .from(cardFieldValues)
      .where(eq(cardFieldValues.cardId, cardId)),
    getDb()
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        sizeBytes: attachments.sizeBytes,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      // Contrato gerado é anexo solto do card, sem campo de formulário.
      .where(
        and(
          eq(attachments.cardId, cardId),
          isNull(attachments.customFieldId),
          eq(attachments.mimeType, "application/pdf"),
        ),
      )
      .orderBy(desc(attachments.createdAt)),
  ]);

  const draft = buildContractDraft(
    toCardValues(definitions, values, card.requesterName),
  );

  return {
    ...draft,
    companies: CONTRACT_COMPANY_KEYS.map((key) => ({
      key,
      name: CONTRACT_COMPANIES[key].legalName,
      ready: CONTRACT_COMPANIES[key].ready,
      kinds: companyKinds(CONTRACT_COMPANIES[key]),
    })),
    existing: existing.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Nome do arquivo no estilo dos contratos: "36481 - Contrato - Cliente - EMPRESA.pdf". */
export function contractFileName(fields: {
  contractNumber: string;
  companyName: string;
  company: string;
}): string {
  const clean = (value: string) =>
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const number = clean(fields.contractNumber);
  const parts = [
    ...(number ? [number] : []),
    "Contrato",
    clean(fields.companyName),
    fields.company,
  ];

  // O limite do banco é 255; `saveUploadedFile` corta em 200 e o ".pdf" tem que sobrar.
  return `${parts.join(" - ").slice(0, 190)}.pdf`;
}

/**
 * Valida o que a pessoa revisou, gera o PDF e o guarda como anexo do card,
 * deixando registro no histórico.
 */
export async function generateContractForCurrentUser(
  cardId: string,
  rawFields: unknown,
): Promise<{ attachmentId: string; fileName: string }> {
  const { card, session, board } = await requireCardEditAccess(cardId);

  const parsed = contractFieldsSchema.safeParse(rawFields);

  if (!parsed.success) {
    throw new ContractValidationError(
      "Há dados inválidos no contrato. Corrija os campos marcados.",
      collectFieldErrors(parsed.error),
    );
  }

  const fields = parsed.data;

  let pdf: Buffer;

  try {
    pdf = await renderContractPdf(buildContractDocument(fields));
  } catch (error) {
    if (error instanceof ContractCompanyNotReadyError) {
      throw new ConflictError(error.message);
    }

    throw error;
  }

  const fileName = contractFileName(fields);
  const uploaded = await saveUploadedFile(
    new File([new Uint8Array(pdf)], fileName, { type: "application/pdf" }),
  );

  try {
    const attachmentId = await getDb().transaction(async (tx) => {
      const [attachment] = await tx
        .insert(attachments)
        .values({
          cardId,
          customFieldId: null,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          storageKey: uploaded.storageKey,
          uploadedByUserId: session.userId,
        })
        .returning({ id: attachments.id });

      await recordCardEvent(
        {
          workspaceId: board.workspaceId,
          boardId: card.boardId,
          cardId,
          actorId: session.userId,
          type: CARD_EVENT_TYPES.contractGenerated,
          metadata: {
            attachmentId: attachment.id,
            fileName: uploaded.fileName,
            company: fields.company,
          },
        },
        tx,
      );

      return attachment.id;
    });

    await commitUploadedFiles([uploaded]);

    return { attachmentId, fileName: uploaded.fileName };
  } catch (error) {
    await discardPendingFiles([uploaded]);
    throw error;
  }
}
