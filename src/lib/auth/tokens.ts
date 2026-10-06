import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import { authTokens, users, type AuthTokenPurpose } from "@/db/schema";

/**
 * Convite e redefinição de senha compartilham o mesmo mecanismo: um token
 * aleatório de uso único, entregue por e-mail dentro de um link, guardado
 * apenas como hash. Nenhuma senha trafega em texto puro em momento algum.
 */

const TTL_SECONDS: Record<AuthTokenPurpose, number> = {
  // Convite dá tempo de a pessoa ver o e-mail com calma.
  invite: 60 * 60 * 24 * 7,
  // Redefinição é uma ação deliberada e imediata; janela curta.
  password_reset: 60 * 60 * 2,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type IssuedToken = { token: string; expiresAt: Date };

/**
 * Emite um token novo e invalida os anteriores do mesmo tipo para o usuário —
 * pedir um segundo link precisa aposentar o primeiro.
 */
export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  createdBy: string | null = null,
): Promise<IssuedToken> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_SECONDS[purpose] * 1000);

  await getDb().transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
        ),
      );

    await tx.insert(authTokens).values({
      userId,
      tokenHash: hashToken(token),
      purpose,
      expiresAt,
      createdBy,
    });
  });

  return { token, expiresAt };
}

export type TokenHolder = {
  tokenId: string;
  userId: string;
  purpose: AuthTokenPurpose;
  name: string;
  email: string;
};

/** Lê um token válido sem consumi-lo. Usado para renderizar a tela. */
export async function readAuthToken(
  token: string | null | undefined,
): Promise<TokenHolder | null> {
  if (!token || token.length < 32 || token.length > 128) {
    return null;
  }

  const [row] = await getDb()
    .select({
      tokenId: authTokens.id,
      userId: authTokens.userId,
      purpose: authTokens.purpose,
      name: users.name,
      email: users.email,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Marca o token como usado, mas só se ainda estiver aberto. O `where` com
 * `usedAt is null` é o que garante o uso único mesmo com duas requisições
 * simultâneas: a segunda não encontra linha para atualizar.
 */
export async function consumeAuthToken(tokenId: string): Promise<boolean> {
  const consumed = await getDb()
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, tokenId), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });

  return consumed.length > 0;
}

/** Higiene: remove tokens expirados ou já consumidos. */
export async function deleteStaleAuthTokens(): Promise<number> {
  const deleted = await getDb()
    .delete(authTokens)
    .where(
      or(lt(authTokens.expiresAt, new Date()), isNotNull(authTokens.usedAt)),
    )
    .returning({ id: authTokens.id });

  return deleted.length;
}
