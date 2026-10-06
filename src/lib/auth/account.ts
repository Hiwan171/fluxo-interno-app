import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { passwordSchema } from "@/lib/validation";

import { hashPassword, verifyPassword } from "./password";
import { createUserSession, type SessionMetadata } from "./session";
import { revokeAllUserSessions } from "./session-store";
import { consumeAuthToken, readAuthToken } from "./tokens";

export type PasswordOutcome =
  | { ok: true }
  | { ok: false; error: string };

function firstValidationError(password: string): string | null {
  const parsed = passwordSchema.safeParse(password);
  return parsed.success ? null : parsed.error.issues[0].message;
}

/**
 * Troca a senha e derruba todas as sessões do usuário. Derrubar tudo é
 * deliberado: se a senha estava comprometida, as sessões abertas em outros
 * dispositivos também estavam.
 */
async function applyNewPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);

  await getDb()
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));

  await revokeAllUserSessions(userId);
}

/**
 * Define a senha a partir de um link de convite ou de redefinição.
 *
 * O token é consumido **antes** da troca: se algo falhar depois, o pior caso é
 * a pessoa pedir outro link — bem melhor do que um token que sobrevive ao uso.
 */
export async function setPasswordWithToken(
  token: string,
  password: string,
  metadata: SessionMetadata = {},
): Promise<PasswordOutcome> {
  const invalidReason = firstValidationError(password);

  if (invalidReason) {
    return { ok: false, error: invalidReason };
  }

  const holder = await readAuthToken(token);

  if (!holder) {
    return {
      ok: false,
      error: "Este link é inválido ou expirou. Peça um novo para quem administra o espaço.",
    };
  }

  if (!(await consumeAuthToken(holder.tokenId))) {
    return { ok: false, error: "Este link já foi utilizado." };
  }

  await applyNewPassword(holder.userId, password);

  await getDb().insert(auditLogs).values({
    actorId: holder.userId,
    action:
      holder.purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset",
    entityType: "user",
    entityId: holder.userId,
    result: "success",
    details: { email: holder.email },
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
  });

  return { ok: true };
}

/**
 * Troca de senha pelo próprio usuário. Exige a senha atual — sem isso, uma
 * sessão sequestrada trocaria a senha e tomaria a conta em definitivo.
 *
 * Cria uma sessão nova depois de revogar as antigas, para que quem trocou a
 * senha não seja deslogado do dispositivo em que está.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  metadata: SessionMetadata = {},
): Promise<PasswordOutcome> {
  const invalidReason = firstValidationError(newPassword);

  if (invalidReason) {
    return { ok: false, error: invalidReason };
  }

  const [user] = await getDb()
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    await getDb().insert(auditLogs).values({
      actorId: userId,
      action: "auth.password_change",
      entityType: "user",
      entityId: userId,
      result: "denied",
      details: { reason: "invalid_current_password" },
      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,
    });

    return { ok: false, error: "A senha atual está incorreta." };
  }

  if (currentPassword === newPassword) {
    return { ok: false, error: "A nova senha precisa ser diferente da atual." };
  }

  await applyNewPassword(userId, newPassword);
  await createUserSession(userId, metadata);

  await getDb().insert(auditLogs).values({
    actorId: userId,
    action: "auth.password_change",
    entityType: "user",
    entityId: userId,
    result: "success",
    details: { email: user.email },
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
  });

  return { ok: true };
}
