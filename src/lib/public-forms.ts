import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  attachments,
  boards,
  cardFieldValues,
  cards,
  customFields,
  formFields,
  intakeForms,
  phases,
} from "@/db/schema";
import type { UploadedFileMeta } from "@/lib/attachments";
import { ConflictError, ResourceNotFoundError } from "@/lib/dal";
import { CARD_EVENT_TYPES, recordCardEvent } from "@/lib/events";
import { normalizeFieldValues } from "@/lib/field-values";

type PendingAttachmentValue = {
  kind: "attachment";
  files: UploadedFileMeta[];
};

function isPendingAttachmentValue(
  value: unknown,
): value is PendingAttachmentValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "attachment"
  );
}

/**
 * Functions in this file are intentionally reachable without an authenticated
 * session — they back the public intake-form page. Never import
 * `requireSession`/`requireBoardAccess` here; do all access checks by
 * verifying the intake form itself (must exist and be published).
 */

function trimmedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function getPublicIntakeForm(publicKey: string) {
  const [form] = await getDb()
    .select({
      id: intakeForms.id,
      boardId: intakeForms.boardId,
      name: intakeForms.name,
      description: intakeForms.description,
      successMessage: intakeForms.successMessage,
      status: intakeForms.status,
      requireRequesterEmail: intakeForms.requireRequesterEmail,
    })
    .from(intakeForms)
    .where(eq(intakeForms.publicKey, publicKey))
    .limit(1);

  if (!form || form.status !== "published") {
    throw new ResourceNotFoundError("Formulário não encontrado ou indisponível.");
  }

  const [fields, [board]] = await Promise.all([
    getDb()
      .select()
      .from(formFields)
      .where(eq(formFields.formId, form.id))
      .orderBy(asc(formFields.position)),
    getDb()
      .select({ name: boards.name, color: boards.color })
      .from(boards)
      .where(eq(boards.id, form.boardId))
      .limit(1),
  ]);

  return { form, fields, board };
}

export async function submitPublicIntakeForm(
  publicKey: string,
  rawValues: Record<string, unknown>,
) {
  const [form] = await getDb()
    .select()
    .from(intakeForms)
    .where(eq(intakeForms.publicKey, publicKey))
    .limit(1);

  if (!form || form.status !== "published") {
    throw new ResourceNotFoundError("Formulário não encontrado ou indisponível.");
  }

  const fields = await getDb()
    .select()
    .from(formFields)
    .where(eq(formFields.formId, form.id))
    .orderBy(asc(formFields.position));

  let title: string | null = null;
  let description: string | null = null;
  let requesterName: string | null = null;
  let requesterEmail: string | null = null;
  const fieldValues: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = rawValues[field.id];

    if (field.isRequired && (raw === undefined || raw === null || raw === "")) {
      throw new ConflictError(`O campo "${field.label}" é obrigatório.`);
    }

    // Os limites espelham as colunas do banco. Sem eles, um envio anônimo
    // podia estourar o tamanho da coluna e derrubar a inserção.
    if (field.targetField === "title") {
      title = trimmedText(raw, 240);
    } else if (field.targetField === "description") {
      description = trimmedText(raw, 20_000);
    } else if (field.targetField === "requester_name") {
      requesterName = trimmedText(raw, 160);
    } else if (field.targetField === "requester_email") {
      requesterEmail = trimmedText(raw, 320);
    } else if (field.customFieldId) {
      fieldValues[field.customFieldId] = raw;
    }
  }

  if (form.requireRequesterEmail && !requesterEmail) {
    throw new ConflictError("Informe um e-mail para continuar.");
  }

  // Mesma validação do caminho autenticado. Este é o ponto de entrada anônimo:
  // antes, qualquer valor entrava no jsonb sem conferir tipo, tamanho ou se a
  // opção escolhida existia.
  const definitions = await getDb()
    .select({
      id: customFields.id,
      label: customFields.label,
      type: customFields.type,
      config: customFields.config,
      isRequired: customFields.isRequired,
    })
    .from(customFields)
    .where(
      and(
        eq(customFields.boardId, form.boardId),
        eq(customFields.isArchived, false),
      ),
    );

  const normalizedValues = normalizeFieldValues(definitions, fieldValues);

  let targetPhaseId = form.targetPhaseId;
  if (!targetPhaseId) {
    // Prefer a phase explicitly flagged as the entry point, but an admin can
    // reorder phases without remembering to keep that flag in sync, so fall
    // back to whichever phase is currently leftmost.
    const [initialPhase] = await getDb()
      .select({ id: phases.id })
      .from(phases)
      .where(eq(phases.boardId, form.boardId))
      .orderBy(desc(phases.isInitial), asc(phases.position))
      .limit(1);
    targetPhaseId = initialPhase?.id ?? null;
  }

  if (!targetPhaseId) {
    throw new ConflictError("Este quadro não possui uma etapa inicial configurada.");
  }

  return getDb().transaction(async (tx) => {
    // Mesmo contador atômico do caminho autenticado: o formulário público é
    // justamente o mais exposto a envios simultâneos.
    const [sequenceRow] = await tx
      .update(boards)
      .set({ cardSequence: sql`${boards.cardSequence} + 1` })
      .where(eq(boards.id, form.boardId))
      .returning({ value: boards.cardSequence });

    if (!sequenceRow) {
      throw new ResourceNotFoundError("Quadro não encontrado.");
    }

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(eq(cards.phaseId, targetPhaseId), eq(cards.status, "active")));

    const [created] = await tx
      .insert(cards)
      .values({
        workspaceId: form.workspaceId,
        boardId: form.boardId,
        phaseId: targetPhaseId,
        number: sequenceRow.value,
        title: title || form.name,
        description,
        position: countRow.value,
        requesterName,
        requesterEmail,
        source: "form",
        sourceFormId: form.id,
      })
      .returning();

    for (const [customFieldId, rawValue] of Object.entries(normalizedValues)) {
      let value = rawValue;

      if (isPendingAttachmentValue(rawValue)) {
        const files = rawValue.files;
        value = { attachmentIds: [] as string[] };
        if (files.length > 0) {
          const insertedAttachments = await tx
            .insert(attachments)
            .values(
              files.map((file) => ({
                cardId: created.id,
                customFieldId,
                fileName: file.fileName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                storageKey: file.storageKey,
              })),
            )
            .returning({ id: attachments.id });
          value = { attachmentIds: insertedAttachments.map((row) => row.id) };
        }
      }

      await tx
        .insert(cardFieldValues)
        .values({ cardId: created.id, customFieldId, value });
    }

    // Sem ator: o card nasceu de um envio anônimo. O histórico registra a
    // origem para que a triagem saiba de onde veio.
    await recordCardEvent(
      {
        workspaceId: form.workspaceId,
        boardId: form.boardId,
        cardId: created.id,
        actorId: null,
        type: CARD_EVENT_TYPES.created,
        metadata: {
          source: "form",
          formName: form.name,
          requesterEmail: requesterEmail ?? null,
        },
      },
      tx,
    );

    return { card: created, successMessage: form.successMessage };
  });
}
