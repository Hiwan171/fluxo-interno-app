import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    systemRole: "admin" | "user";
  };
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createStoredSession(
  userId: string,
  metadata: SessionMetadata = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await getDb().insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent?.slice(0, 2_000) ?? null,
  });

  return { token, expiresAt };
}

export async function readStoredSession(
  token: string | null | undefined,
): Promise<AuthSession | null> {
  if (!token || token.length < 32 || token.length > 128) {
    return null;
  }

  const now = new Date();
  const [row] = await getDb()
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userEmail: users.email,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      userSystemRole: users.systemRole,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  if (now.getTime() - row.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await getDb()
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(sessions.id, row.id),
          lt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS)),
        ),
      );
  }

  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
      avatarUrl: row.userAvatarUrl,
      systemRole: row.userSystemRole,
    },
  };
}

export async function revokeStoredSession(
  token: string | null | undefined,
): Promise<void> {
  if (!token || token.length < 32 || token.length > 128) {
    return;
  }

  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)),
    );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await getDb()
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  return deleted.length;
}
