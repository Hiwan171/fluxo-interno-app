import "server-only";

import { cookies } from "next/headers";

import {
  createStoredSession,
  readStoredSession,
  revokeStoredSession,
  SESSION_TTL_SECONDS,
  type AuthSession,
  type SessionMetadata,
} from "./session-store";

export const SESSION_COOKIE_NAME = "fluxo_session";

function shouldUseSecureCookie(): boolean {
  if (process.env.SESSION_COOKIE_SECURE) {
    return process.env.SESSION_COOKIE_SECURE === "true";
  }

  return process.env.NODE_ENV === "production";
}

export async function createUserSession(
  userId: string,
  metadata: SessionMetadata = {},
): Promise<AuthSession> {
  const { token, expiresAt } = await createStoredSession(userId, metadata);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: expiresAt,
    priority: "high",
  });

  const session = await readStoredSession(token);
  if (!session) {
    throw new Error("A sessão criada não pôde ser recuperada.");
  }

  return session;
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return readStoredSession(token);
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  await revokeStoredSession(token);
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export type { AuthSession, SessionMetadata } from "./session-store";
