import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db/client";
import {
  commitUploadedFiles,
  discardPendingFiles,
  MAX_FILE_SIZE_BYTES,
  saveUploadedFile,
  type UploadedFileMeta,
} from "@/lib/attachments";

import type { ImportPlan, PlanCard } from "./plan";

/**
 * Grava um plano de importação.
 *
 * Tudo entra numa única transação: ou o quadro inteiro existe ao final, ou nada
 * foi criado. Os anexos são baixados antes dela e só promovidos ao diretório
 * definitivo depois do commit, o mesmo contrato que o app usa ao salvar um card.
 *
 * A escrita é direta no banco, sem passar pelas rotinas de movimentação, de
 * propósito: mover um card pelo app dispararia as automações de e-mail e
 * mandaria mensagem a cada solicitante do histórico.
 */

export const IMPORT_MARKER = "Importado do Pipefy";

export type ApplyOptions = {
  workspaceSlug?: string;
  replace?: boolean;
  downloadAttachments?: boolean;
  log?: (message: string) => void;
};

export type AttachmentFailure = {
  cardNumber: number;
  field: string;
  file: string;
  reason: string;
};

export type ApplyReport = {
  boardId: string;
  boardSlug: string;
  formPublicKey: string | null;
  counts: {
    phases: number;
    fields: number;
    cards: number;
    fieldValues: number;
    comments: number;
    events: number;
    attachmentsImported: number;
    attachmentsFailed: number;
  };
  attachmentFailures: AttachmentFailure[];
};

type DownloadedAttachment = { id: string; fieldKey: string; meta: UploadedFileMeta };

const CHUNK = 300;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/** Nome do arquivo e caminho sem a assinatura, que não deve ir parar em relatório. */
function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() ?? "arquivo");
  } catch {
    return "arquivo";
  }
}

async function downloadOne(url: string): Promise<UploadedFileMeta> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

      if (!response.ok) {
        // Erro do cliente não melhora tentando de novo (link expirado, 403).
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`o Pipefy respondeu ${response.status}`);
        }
        throw new Error(`erro temporário ${response.status}`);
      }

      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `maior que ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB`,
        );
      }

      const bytes = await response.arrayBuffer();
      return await saveUploadedFile(new File([bytes], describeUrl(url)));
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // Só repete o que pode ser passageiro.
      if (!/temporário|timeout|fetch failed|aborted|network/i.test(message)) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function downloadAll(
  plan: ImportPlan,
  log: (message: string) => void,
): Promise<{
  byCard: Map<number, DownloadedAttachment[]>;
  failures: AttachmentFailure[];
  allMetas: UploadedFileMeta[];
}> {
  const byCard = new Map<number, DownloadedAttachment[]>();
  const failures: AttachmentFailure[] = [];
  const allMetas: UploadedFileMeta[] = [];

  const jobs: Array<{ card: PlanCard; fieldKey: string; url: string }> = [];
  for (const card of plan.cards) {
    for (const attachment of card.attachments) {
      jobs.push({ card, fieldKey: attachment.fieldKey, url: attachment.url });
    }
  }

  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;

      try {
        const meta = await downloadOne(job.url);
        allMetas.push(meta);
        const list = byCard.get(job.card.number) ?? [];
        list.push({ id: randomUUID(), fieldKey: job.fieldKey, meta });
        byCard.set(job.card.number, list);
      } catch (error) {
        failures.push({
          cardNumber: job.card.number,
          field: job.fieldKey,
          file: describeUrl(job.url),
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      done += 1;
      if (done % 25 === 0 || done === jobs.length) {
        log(`  anexos: ${done}/${jobs.length} (${failures.length} recusados)`);
      }
    }
  };

  await Promise.all(Array.from({ length: 6 }, worker));
  return { byCard, failures, allMetas };
}

export async function applyPlan(
  plan: ImportPlan,
  options: ApplyOptions = {},
): Promise<ApplyReport> {
  const log = options.log ?? (() => {});
  const db = getDb();
  const { boards, phases, customFields, intakeForms, formFields, cards, cardFieldValues, attachments, comments, events, workspaces, users, auditLogs } = schema;

  const [workspace] = options.workspaceSlug
    ? await db.select().from(workspaces).where(eq(workspaces.slug, options.workspaceSlug)).limit(1)
    : await db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1);

  if (!workspace) throw new Error("Workspace não encontrado. Rode o bootstrap do administrador antes.");

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.systemRole, "admin"))
    .orderBy(asc(users.createdAt))
    .limit(1);

  const [existing] = await db
    .select({ id: boards.id, description: boards.description })
    .from(boards)
    .where(and(eq(boards.workspaceId, workspace.id), eq(boards.slug, plan.board.slug)))
    .limit(1);

  if (existing) {
    if (!options.replace) {
      throw new Error(
        `Já existe um quadro com o endereço "${plan.board.slug}". Use --replace para substituí-lo ou escolha outro com --slug.`,
      );
    }
    if (!existing.description?.startsWith(IMPORT_MARKER)) {
      throw new Error(
        `O quadro "${plan.board.slug}" não foi criado por uma importação; --replace só substitui quadros importados.`,
      );
    }
  }

  let downloaded: Awaited<ReturnType<typeof downloadAll>> = {
    byCard: new Map(),
    failures: [],
    allMetas: [],
  };

  if (options.downloadAttachments !== false && plan.summary.attachmentCount > 0) {
    log(`Baixando ${plan.summary.attachmentCount} anexo(s) do Pipefy...`);
    downloaded = await downloadAll(plan, log);
  }

  const boardId = randomUUID();
  const phaseIds = new Map(plan.phases.map((phase) => [phase.name, randomUUID()]));
  const fieldIds = new Map(plan.fields.map((field) => [field.key, randomUUID()]));
  const formId = plan.form ? randomUUID() : null;
  const formPublicKey = plan.form ? randomBytes(16).toString("base64url") : null;
  const cardIds = new Map(plan.cards.map((card) => [card.number, randomUUID()]));
  const maxNumber = Math.max(0, ...plan.cards.map((card) => card.number));

  const counts: ApplyReport["counts"] = {
    phases: plan.phases.length,
    fields: plan.fields.length,
    cards: plan.cards.length,
    fieldValues: 0,
    comments: 0,
    events: 0,
    attachmentsImported: 0,
    attachmentsFailed: downloaded.failures.length,
  };

  try {
    await db.transaction(async (tx) => {
      if (existing) {
        await tx.delete(boards).where(eq(boards.id, existing.id));
        log(`Quadro anterior "${plan.board.slug}" removido.`);
      }

      const [boardCount] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(boards)
        .where(eq(boards.workspaceId, workspace.id));

      await tx.insert(boards).values({
        id: boardId,
        workspaceId: workspace.id,
        name: plan.board.name,
        slug: plan.board.slug,
        // O prefixo é o que `--replace` usa para só substituir quadros que vieram
        // de uma importação, nunca um criado à mão.
        description: plan.board.description.startsWith(IMPORT_MARKER)
          ? plan.board.description
          : `${IMPORT_MARKER}. ${plan.board.description}`,
        color: plan.board.color,
        visibility: plan.board.visibility,
        position: boardCount.value,
        cardSequence: maxNumber,
        createdBy: admin?.id ?? null,
      });

      // Quadro privado precisa de ao menos um dono: sem membros, só o
      // administrador do sistema (que enxerga tudo) chegaria a ele.
      if (admin) {
        await tx.insert(schema.boardMembers).values({
          boardId,
          userId: admin.id,
          role: "manager",
        });
      }

      await tx.insert(phases).values(
        plan.phases.map((phase) => ({
          id: phaseIds.get(phase.name)!,
          boardId,
          name: phase.name,
          position: phase.position,
          isInitial: phase.isInitial,
          isFinal: phase.isFinal,
        })),
      );

      if (plan.fields.length > 0) {
        await tx.insert(customFields).values(
          plan.fields.map((field, position) => ({
            id: fieldIds.get(field.key)!,
            boardId,
            phaseId: field.phase ? phaseIds.get(field.phase)! : null,
            key: field.key,
            label: field.label.slice(0, 160),
            type: field.type,
            config:
              field.type === "select"
                ? { options: field.options.map((option) => ({ label: option, value: option })) }
                : {},
            isRequired: false,
            position,
          })),
        );
      }

      if (plan.kanbanFieldKeys.length > 0) {
        await tx
          .update(boards)
          .set({ kanbanVisibleFieldIds: plan.kanbanFieldKeys.map((key) => fieldIds.get(key)!) })
          .where(eq(boards.id, boardId));
      }

      if (plan.form && formId && formPublicKey) {
        await tx.insert(intakeForms).values({
          id: formId,
          workspaceId: workspace.id,
          boardId,
          targetPhaseId: phaseIds.get(plan.form.targetPhase) ?? null,
          name: plan.form.name,
          publicKey: formPublicKey,
          successMessage: plan.form.successMessage,
          // Rascunho de propósito: publicar é uma decisão de quem administra, e
          // um formulário aberto na internet não deve nascer de uma importação.
          status: "draft",
          requireRequesterEmail: plan.form.requireRequesterEmail,
          createdBy: admin?.id ?? null,
        });

        await tx.insert(formFields).values(
          plan.form.fields.map((field, position) => ({
            formId,
            customFieldId: field.fieldKey ? fieldIds.get(field.fieldKey)! : null,
            targetField: field.targetField,
            type: field.type,
            label: field.label.slice(0, 160),
            options: field.options.map((option) => ({ label: option, value: option })),
            isRequired: field.required,
            position,
          })),
        );
      }

      for (const batch of chunks(plan.cards)) {
        await tx.insert(cards).values(
          batch.map((card) => ({
            id: cardIds.get(card.number)!,
            workspaceId: workspace.id,
            boardId,
            phaseId: phaseIds.get(card.phase)!,
            phaseEnteredAt: card.phaseEnteredAt,
            number: card.number,
            title: card.title,
            description: card.description,
            status: card.status,
            priority: card.priority,
            position: card.position,
            requesterName: card.requesterName,
            requesterEmail: card.requesterEmail,
            dueAt: card.dueAt,
            completedAt: card.completedAt,
            source: card.source,
            sourceFormId: card.source === "form" ? formId : null,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          })),
        );
      }

      // Valores de campo e anexos.
      const valueRows: Array<typeof cardFieldValues.$inferInsert> = [];
      const attachmentRows: Array<typeof attachments.$inferInsert> = [];

      for (const card of plan.cards) {
        const cardId = cardIds.get(card.number)!;

        for (const [fieldKey, value] of Object.entries(card.values)) {
          valueRows.push({
            cardId,
            customFieldId: fieldIds.get(fieldKey)!,
            value,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          });
        }

        const files = downloaded.byCard.get(card.number) ?? [];
        const byField = new Map<string, string[]>();

        for (const file of files) {
          attachmentRows.push({
            id: file.id,
            cardId,
            customFieldId: fieldIds.get(file.fieldKey)!,
            fileName: file.meta.fileName,
            mimeType: file.meta.mimeType,
            sizeBytes: file.meta.sizeBytes,
            storageKey: file.meta.storageKey,
            createdAt: card.createdAt,
          });
          byField.set(file.fieldKey, [...(byField.get(file.fieldKey) ?? []), file.id]);
        }

        for (const [fieldKey, ids] of byField) {
          valueRows.push({
            cardId,
            customFieldId: fieldIds.get(fieldKey)!,
            value: { attachmentIds: ids },
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          });
        }
      }

      // Os anexos precisam existir antes dos valores que os referenciam.
      for (const batch of chunks(attachmentRows)) await tx.insert(attachments).values(batch);
      for (const batch of chunks(valueRows)) await tx.insert(cardFieldValues).values(batch);
      counts.fieldValues = valueRows.length;
      counts.attachmentsImported = attachmentRows.length;

      const commentRows = plan.cards
        .filter((card) => card.comment)
        .map((card) => ({
          cardId: cardIds.get(card.number)!,
          authorId: null,
          body: card.comment!.body.slice(0, 20_000),
          isInternal: true,
          createdAt: card.comment!.at,
          updatedAt: card.comment!.at,
        }));
      for (const batch of chunks(commentRows)) await tx.insert(comments).values(batch);
      counts.comments = commentRows.length;

      const eventRows = plan.cards.flatMap((card) =>
        card.events.map((event) => ({
          workspaceId: workspace.id,
          boardId,
          cardId: cardIds.get(card.number)!,
          actorId: null,
          type: event.type,
          metadata: event.metadata,
          occurredAt: event.at,
        })),
      );
      for (const batch of chunks(eventRows, 500)) await tx.insert(events).values(batch);
      counts.events = eventRows.length;

      await tx.insert(auditLogs).values({
        workspaceId: workspace.id,
        actorId: admin?.id ?? null,
        action: "board.import_pipefy",
        entityType: "board",
        entityId: boardId,
        details: { ...counts, boardSlug: plan.board.slug },
      });
    });
  } catch (error) {
    // A transação desfez tudo; sobram só os arquivos pendentes.
    await discardPendingFiles(downloaded.allMetas);
    throw error;
  }

  await commitUploadedFiles(downloaded.allMetas);

  return {
    boardId,
    boardSlug: plan.board.slug,
    formPublicKey,
    counts,
    attachmentFailures: downloaded.failures,
  };
}
