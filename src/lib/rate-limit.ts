import "server-only";

import { lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitCounters } from "@/db/schema";

/**
 * Limitador de janela fixa em memória.
 *
 * Serve para conter abuso de alto volume (envio de formulário público, upload)
 * numa instância única — que é o desenho atual, já que os anexos moram no disco
 * local. Não sobrevive a reinício nem se propaga entre réplicas: quando houver
 * mais de uma instância, isto precisa migrar para Postgres ou Redis.
 *
 * Para tentativas de login o controle é outro, ancorado em `audit_logs`, porque
 * ali a persistência importa — ver `checkLoginThrottle`.
 */

type Bucket = { count: number; resetAt: number };

declare global {
  var __fluxoRateLimitBuckets: Map<string, Bucket> | undefined;
}

const MAX_TRACKED_KEYS = 10_000;

function getBuckets(): Map<string, Bucket> {
  if (!globalThis.__fluxoRateLimitBuckets) {
    globalThis.__fluxoRateLimitBuckets = new Map();
  }

  return globalThis.__fluxoRateLimitBuckets;
}

/** Remove janelas já expiradas para o mapa não crescer sem limite. */
function sweep(buckets: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Segundos até a janela reabrir. Zero quando a requisição foi permitida. */
  retryAfterSeconds: number;
};

/**
 * Versão persistente, para superfícies alcançáveis da internet.
 *
 * O contador vive no Postgres, então sobrevive a reinício do container e vale
 * para todas as réplicas. O `on conflict do update` faz o incremento no banco —
 * ler e depois gravar deixaria dois envios simultâneos contarem como um.
 *
 * Custa uma ida ao banco por chamada; use apenas onde a persistência importa.
 */
export async function consumePersistentRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  // Janela fixa alinhada ao relógio: todos os processos calculam o mesmo
  // início para o mesmo instante, sem precisar coordenar entre si.
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  const [row] = await getDb()
    .insert(rateLimitCounters)
    .values({ bucket: key, windowStart, expiresAt, hits: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.bucket, rateLimitCounters.windowStart],
      set: { hits: sql`${rateLimitCounters.hits} + 1` },
    })
    .returning({ hits: rateLimitCounters.hits });

  const hits = row?.hits ?? 1;

  if (hits > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((expiresAt.getTime() - now) / 1000),
      ),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Remove janelas expiradas. Sem isto a tabela cresce indefinidamente — cada
 * IP distinto deixa uma linha por janela.
 */
export async function purgeExpiredRateLimits(): Promise<number> {
  const removed = await getDb()
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.expiresAt, new Date()))
    .returning({ bucket: rateLimitCounters.bucket });

  return removed.length;
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const buckets = getBuckets();
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) sweep(buckets, now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Identifica o cliente a partir dos cabeçalhos do proxy reverso.
 *
 * O Caddy acrescenta o endereço real ao final de `X-Forwarded-For`, então o
 * último valor da lista é o único que o cliente não consegue forjar. Ler o
 * primeiro — o padrão em muitos exemplos — deixaria qualquer pessoa escapar do
 * limite mandando o cabeçalho na mão.
 */
export function clientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (parts.length > 0) return parts[parts.length - 1];
  }

  return headers.get("x-real-ip")?.trim() || "desconhecido";
}
