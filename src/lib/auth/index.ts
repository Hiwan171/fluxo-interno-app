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
import { checkLoginThrottle } from "./throttle";

export type AuthenticatedUser = AuthSession["user"];

export type SignInResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

type CredentialsResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/**
 * O e-mail vai para `details` em toda linha de login — sucesso ou falha — porque
 * é a chave que `checkLoginThrottle` usa para contar tentativas por conta. Sem
 * ele, uma tentativa contra um e-mail inexistente não teria como ser atribuída.
 */
function loginAuditDetails(email: string, reason?: string) {
  return reason ? { email, reason } : { email };
}

export async function authenticateCredentials(
  input: LoginInput,
  metadata: SessionMetadata = {},
): Promise<CredentialsResult> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const email = normalizeEmail(parsed.data.email);
  const ipAddress = metadata.ipAddress ?? null;

  // Antes de qualquer coisa: verificar a senha custa 19 MiB de Argon2, e esse
  // custo não pode ficar à disposição de quem não passou pelo limite.
  const throttle = await checkLoginThrottle(email, ipAddress);

  if (throttle.blocked) {
    await getDb().insert(auditLogs).values({
      action: "auth.login",
      result: "denied",
      details: loginAuditDetails(email, "throttled"),
      ipAddress,
      userAgent: metadata.userAgent ?? null,
    });

    return {
      ok: false,
      reason: "throttled",
      retryAfterSeconds: throttle.retryAfterSeconds,
    };
  }

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
      details: loginAuditDetails(email, "invalid_credentials"),
      ipAddress,
      userAgent: metadata.userAgent ?? null,
    });
    return { ok: false, reason: "invalid_credentials" };
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
      details: loginAuditDetails(
        email,
        user.isActive ? "invalid_credentials" : "inactive_user",
      ),
      ipAddress,
      userAgent: metadata.userAgent ?? null,
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  await getDb()
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      systemRole: user.systemRole,
    },
  };
}

export async function signIn(
  input: LoginInput,
  metadata: SessionMetadata = {},
): Promise<SignInResult> {
  const result = await authenticateCredentials(input, metadata);

  if (!result.ok) {
    return result;
  }

  const session = await createUserSession(result.user.id, metadata);

  await getDb().insert(auditLogs).values({
    actorId: result.user.id,
    sessionId: session.id,
    action: "auth.login",
    result: "success",
    details: loginAuditDetails(normalizeEmail(result.user.email)),
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
  });

  return { ok: true, session };
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

export { changeOwnPassword, setPasswordWithToken } from "./account";
export {
  consumeAuthToken,
  deleteStaleAuthTokens,
  issueAuthToken,
  readAuthToken,
} from "./tokens";
export {
  checkLoginThrottle,
  deleteExpiredSessions,
  getCurrentSession,
  hashPassword,
  normalizeEmail,
  revokeAllUserSessions,
  SESSION_COOKIE_NAME,
  verifyPassword,
};
export type { PasswordOutcome } from "./account";
export type { TokenHolder } from "./tokens";
export type { AuthSession, LoginInput, SessionMetadata };
