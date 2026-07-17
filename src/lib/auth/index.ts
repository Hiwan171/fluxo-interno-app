import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { loginSchema, type LoginInput } from "@/lib/validation";

import { hashPassword, normalizeEmail, verifyPassword } from "./password";
import {
  createUserSession,
  destroyCurrentSession,
  getCurrentSession,
  SESSION_COOKIE_NAME,
  type AuthSession,
  type SessionMetadata,
} from "./session";
import {
  deleteExpiredSessions,
  revokeAllUserSessions,
} from "./session-store";

export type AuthenticatedUser = AuthSession["user"];

export async function authenticateCredentials(
  input: LoginInput,
  metadata: SessionMetadata = {},
): Promise<AuthenticatedUser | null> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return null;
  }

  const email = normalizeEmail(parsed.data.email);
  const [user] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      systemRole: users.systemRole,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Mantém um custo semelhante ao caminho válido e reduz enumeração por tempo.
    await hashPassword(parsed.data.password);
    await getDb().insert(auditLogs).values({
      action: "auth.login",
      result: "denied",
      details: { reason: "invalid_credentials" },
      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,
    });
    return null;
  }

  const passwordMatches = await verifyPassword(
    user.passwordHash,
    parsed.data.password,
  );

  if (!passwordMatches || !user.isActive) {
    await getDb().insert(auditLogs).values({
      actorId: user.id,
      action: "auth.login",
      result: "denied",
      details: {
        reason: user.isActive ? "invalid_credentials" : "inactive_user",
      },
      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,
    });
    return null;
  }

  await getDb()
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    systemRole: user.systemRole,
  };
}

export async function signIn(
  input: LoginInput,
  metadata: SessionMetadata = {},
): Promise<AuthSession | null> {
  const user = await authenticateCredentials(input, metadata);

  if (!user) {
    return null;
  }

  const session = await createUserSession(user.id, metadata);

  await getDb().insert(auditLogs).values({
    actorId: user.id,
    sessionId: session.id,
    action: "auth.login",
    result: "success",
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
  });

  return session;
}

export async function signOut(): Promise<void> {
  const session = await getCurrentSession();
  await destroyCurrentSession();

  if (session) {
    await getDb().insert(auditLogs).values({
      actorId: session.userId,
      sessionId: session.id,
      action: "auth.logout",
      result: "success",
    });
  }
}

export {
  deleteExpiredSessions,
  getCurrentSession,
  hashPassword,
  normalizeEmail,
  revokeAllUserSessions,
  SESSION_COOKIE_NAME,
  verifyPassword,
};
export type { AuthSession, LoginInput, SessionMetadata };
