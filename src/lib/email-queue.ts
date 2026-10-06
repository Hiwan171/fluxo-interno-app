import "server-only";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { emailMessages } from "@/db/schema";
import { sendWorkflowEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

/**
 * Consumo da fila de e-mail.
 *
 * O schema já previa a fila desde o início — `status: "queued"`, `scheduledAt`,
 * `attempts` e o índice `email_messages_queue_idx` — e nada a usava: o envio
 * era síncrono dentro do request que movia o card. Aqui a fila passa a ser
 * consumida de fato, com nova tentativa em caso de falha.
 */

export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

/** Espera crescente entre tentativas: 1, 2, 4, 8, 16 minutos. */
function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts, 16) * 60_000;
}

type ClaimedMessage = {
  id: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  textBody: string | null;
  attempts: number;
};

/**
 * Reserva um lote para este worker.
 *
 * `for update skip locked` é o que permite rodar mais de um worker sem que dois
 * peguem a mesma mensagem: quem chega depois pula as linhas já travadas em vez
 * de esperar por elas. A marcação para `sending` acontece na mesma transação,
 * então uma mensagem nunca fica reservada sem estar marcada.
 */
async function claimBatch(): Promise<ClaimedMessage[]> {
  return getDb().transaction(async (tx) => {
    const candidates = await tx
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.status, "queued"),
          or(
            isNull(emailMessages.scheduledAt),
            lte(emailMessages.scheduledAt, new Date()),
          ),
        ),
      )
      .orderBy(emailMessages.scheduledAt)
      .limit(BATCH_SIZE)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return [];

    return tx
      .update(emailMessages)
      .set({ status: "sending" })
      .where(
        inArray(
          emailMessages.id,
          candidates.map((row) => row.id),
        ),
      )
      .returning({
        id: emailMessages.id,
        toAddresses: emailMessages.toAddresses,
        ccAddresses: emailMessages.ccAddresses,
        subject: emailMessages.subject,
        textBody: emailMessages.textBody,
        attempts: emailMessages.attempts,
      });
  });
}

async function deliver(message: ClaimedMessage): Promise<void> {
  try {
    const result = await sendWorkflowEmail({
      to: message.toAddresses,
      cc: message.ccAddresses.length > 0 ? message.ccAddresses : undefined,
      // O corpo já foi renderizado quando a mensagem entrou na fila; passar um
      // template vazio evita uma segunda substituição sobre o texto final.
      subjectTemplate: message.subject,
      bodyTemplate: message.textBody ?? "",
      context: {},
      skipTemplating: true,
    });

    await getDb()
      .update(emailMessages)
      .set({
        status: "sent",
        providerMessageId: result.providerId,
        sentAt: new Date(),
        attempts: message.attempts + 1,
        errorMessage: null,
      })
      .where(eq(emailMessages.id, message.id));

    logger.info("email.sent", {
      messageId: message.id,
      attempts: message.attempts + 1,
    });
  } catch (error) {
    const attempts = message.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;

    await getDb()
      .update(emailMessages)
      .set({
        // Enquanto houver tentativa restante, volta para a fila com a próxima
        // execução adiada; esgotado, para em `failed` para inspeção humana.
        status: exhausted ? "failed" : "queued",
        scheduledAt: exhausted ? null : new Date(Date.now() + backoffMs(attempts)),
        attempts,
        errorMessage:
          error instanceof Error ? error.message : "Erro desconhecido.",
      })
      .where(eq(emailMessages.id, message.id));

    logger.error("email.delivery_failed", error, {
      messageId: message.id,
      attempts,
      exhausted,
    });
  }
}

export type QueueRunResult = { processed: number };

/** Processa um lote. Devolve quantas mensagens foram tratadas. */
export async function processEmailQueue(): Promise<QueueRunResult> {
  const batch = await claimBatch();

  for (const message of batch) {
    await deliver(message);
  }

  return { processed: batch.length };
}

/**
 * Devolve à fila mensagens presas em `sending`.
 *
 * Se o worker morrer no meio de um lote, as linhas ficam marcadas como
 * `sending` para sempre e ninguém mais as pega. Reaproveitar depois de um
 * tempo prudente é o que impede a fila de vazar mensagens.
 */
export async function requeueStalledMessages(
  stalledAfterMinutes = 15,
): Promise<number> {
  const threshold = new Date(Date.now() - stalledAfterMinutes * 60_000);

  const requeued = await getDb()
    .update(emailMessages)
    .set({ status: "queued", scheduledAt: new Date() })
    .where(
      and(
        eq(emailMessages.status, "sending"),
        lte(emailMessages.updatedAt, threshold),
        sql`${emailMessages.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .returning({ id: emailMessages.id });

  if (requeued.length > 0) {
    logger.warn("email.requeued_stalled", { count: requeued.length });
  }

  return requeued.length;
}
