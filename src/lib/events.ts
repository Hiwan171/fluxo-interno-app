import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb, type Database } from "@/db";
import { events, users } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Histórico do card.
 *
 * A tabela `events` existia desde o início, com índices, e nunca recebeu uma
 * escrita — não havia como saber quem moveu, editou ou arquivou um card. Este
 * módulo é o único ponto de escrita, para que o vocabulário de tipos fique em
 * um lugar só.
 */

export const CARD_EVENT_TYPES = {
  created: "card.created",
  moved: "card.moved",
  updated: "card.updated",
  archived: "card.archived",
  assigned: "card.assigned",
  unassigned: "card.unassigned",
  commented: "card.commented",
  emailSent: "card.email_sent",
  completed: "card.completed",
  contractGenerated: "card.contract_generated",
} as const;

export type CardEventType =
  (typeof CARD_EVENT_TYPES)[keyof typeof CARD_EVENT_TYPES];

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type RecordEventInput = {
  workspaceId: string;
  boardId: string;
  cardId: string;
  actorId: string | null;
  type: CardEventType;
  metadata?: Record<string, unknown>;
};

/**
 * Grava dentro da transação recebida quando há uma — assim o histórico não
 * registra algo que acabou sendo desfeito por um rollback.
 */
export async function recordCardEvent(
  input: RecordEventInput,
  tx?: Tx,
): Promise<void> {
  const executor = tx ?? getDb();

  await executor.insert(events).values({
    workspaceId: input.workspaceId,
    boardId: input.boardId,
    cardId: input.cardId,
    actorId: input.actorId,
    type: input.type,
    metadata: input.metadata ?? {},
  });
}

/**
 * Versão que nunca derruba a operação principal. Perder uma linha de histórico
 * é ruim; impedir alguém de mover um card por causa disso é pior.
 */
export async function recordCardEventSafely(
  input: RecordEventInput,
): Promise<void> {
  try {
    await recordCardEvent(input);
  } catch (error) {
    logger.error("events.record_failed", error, {
      cardId: input.cardId,
      type: input.type,
    });
  }
}

export type CardEventRow = {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
};

const HISTORY_PAGE_SIZE = 100;

export async function listCardEvents(cardId: string): Promise<CardEventRow[]> {
  return getDb()
    .select({
      id: events.id,
      type: events.type,
      metadata: events.metadata,
      occurredAt: events.occurredAt,
      actorId: events.actorId,
      actorName: users.name,
      actorAvatarUrl: users.avatarUrl,
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.actorId))
    .where(and(eq(events.cardId, cardId)))
    .orderBy(desc(events.occurredAt))
    .limit(HISTORY_PAGE_SIZE);
}
