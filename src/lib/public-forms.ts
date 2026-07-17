import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  boards,
  cardFieldValues,
  cards,
  formFields,
  intakeForms,
  phases,
} from "@/db/schema";
import { ConflictError, ResourceNotFoundError } from "@/lib/dal";

/**
 * Functions in this file are intentionally reachable without an authenticated
 * session — they back the public intake-form page. Never import
 * `requireSession`/`requireBoardAccess` here; do all access checks by
 * verifying the intake form itself (must exist and be published).
 */

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

    if (field.targetField === "title") {
      title = typeof raw === "string" ? raw.trim() : null;
    } else if (field.targetField === "description") {
      description = typeof raw === "string" ? raw.trim() : null;
    } else if (field.targetField === "requester_name") {
      requesterName = typeof raw === "string" ? raw.trim() : null;
    } else if (field.targetField === "requester_email") {
      requesterEmail = typeof raw === "string" ? raw.trim() : null;
    } else if (field.customFieldId) {
      fieldValues[field.customFieldId] = raw;
    }
  }

  if (form.requireRequesterEmail && !requesterEmail) {
    throw new ConflictError("Informe um e-mail para continuar.");
  }

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
    const [numberRow] = await tx
      .select({ value: sql<number>`coalesce(max(${cards.number}), 0) + 1` })
      .from(cards)
      .where(eq(cards.boardId, form.boardId));

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
        number: numberRow.value,
        title: title || form.name,
        description,
        position: countRow.value,
        requesterName,
        requesterEmail,
        source: "form",
        sourceFormId: form.id,
      })
      .returning();

    for (const [customFieldId, value] of Object.entries(fieldValues)) {
      await tx
        .insert(cardFieldValues)
        .values({ cardId: created.id, customFieldId, value });
    }

    return { card: created, successMessage: form.successMessage };
  });
}
