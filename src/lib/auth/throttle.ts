import "server-only";

import { and, desc, eq, gt, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Controle de tentativas de login.
 *
 * Duas camadas, com propósitos diferentes:
 *
 * 1. Uma barreira em memória por IP, avaliada antes de qualquer trabalho. É o
 *    que impede a exaustão de memória: cada verificação de senha custa 19 MiB
 *    de Argon2, então o número de tentativas simultâneas precisa ter teto
 *    independente de o e-mail existir ou não.
 * 2. Uma contagem persistente sobre `audit_logs`, que já registra cada falha.
 *    Sobrevive a reinício da aplicação e é o que efetivamente trava a força
 *    bruta contra uma conta específica.
 */

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** Teto de tentativas por minuto e por IP, antes de gastar CPU com Argon2. */
const BURST_LIMIT_PER_IP = 30;
const BURST_WINDOW_SECONDS = 60;

export type ThrottleDecision =
  | { blocked: false }
  | { blocked: true; retryAfterSeconds: number };

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000);
}

/** Momento do último login bem-sucedido do e-mail, se houver. */
async function lastSuccessAt(email: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "auth.login"),
        eq(auditLogs.result, "success"),
        sql`${auditLogs.details} ->> 'email' = ${email}`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  return row?.createdAt ?? null;
}

async function countFailures(since: Date, matcher: SQL) {
  const [row] = await getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "auth.login"),
        eq(auditLogs.result, "denied"),
        gt(auditLogs.createdAt, since),
        matcher,
      ),
    );

  return row?.value ?? 0;
}

/**
 * Decide se a tentativa pode prosseguir. Chamar **antes** de verificar a senha
 * — bloquear depois do Argon2 não resolveria o custo computacional do ataque.
 */
export async function checkLoginThrottle(
  email: string,
  ipAddress: string | null,
): Promise<ThrottleDecision> {
  if (ipAddress) {
    const burst = consumeRateLimit(
      `login:burst:${ipAddress}`,
      BURST_LIMIT_PER_IP,
      BURST_WINDOW_SECONDS,
    );

    if (!burst.allowed) {
      return { blocked: true, retryAfterSeconds: burst.retryAfterSeconds };
    }
  }

  // Um login bem-sucedido zera a contagem: quem acabou de entrar não deve ser
  // punido por erros de digitação anteriores.
  const since = new Date(
    Math.max(
      windowStart().getTime(),
      (await lastSuccessAt(email))?.getTime() ?? 0,
    ),
  );

  const emailFailures = await countFailures(
    since,
    sql`${auditLogs.details} ->> 'email' = ${email}`,
  );

  if (emailFailures >= MAX_FAILURES_PER_EMAIL) {
    return { blocked: true, retryAfterSeconds: WINDOW_MINUTES * 60 };
  }

  if (ipAddress) {
    const ipFailures = await countFailures(
      windowStart(),
      eq(auditLogs.ipAddress, ipAddress),
    );

    if (ipFailures >= MAX_FAILURES_PER_IP) {
      return { blocked: true, retryAfterSeconds: WINDOW_MINUTES * 60 };
    }
  }

  return { blocked: false };
}

export const LOGIN_THROTTLE_WINDOW_MINUTES = WINDOW_MINUTES;
