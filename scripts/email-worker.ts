import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { closeDb } from "../src/db/client";
import {
  processEmailQueue,
  requeueStalledMessages,
} from "../src/lib/email-queue";
import { logger } from "../src/lib/logger";
import { purgeExpiredRateLimits } from "../src/lib/rate-limit";

/**
 * Worker da fila de e-mail.
 *
 * Roda como processo separado (serviço `worker` do docker-compose) justamente
 * para tirar o SMTP do caminho da requisição: mover um card volta a ser
 * instantâneo, e uma falha de entrega vira nova tentativa em vez de uma linha
 * de log perdida.
 *
 *   npm run worker:email          # laço contínuo
 *   npm run worker:email -- --once  # um lote e sai (útil em cron)
 */

const POLL_INTERVAL_MS = Number(process.env.EMAIL_WORKER_INTERVAL_MS ?? 15_000);
const STALLED_SWEEP_EVERY = 20;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(): Promise<number> {
  const { processed } = await processEmailQueue();
  return processed;
}

async function runForever(): Promise<void> {
  let cycles = 0;

  logger.info("email.worker.started", { intervalMs: POLL_INTERVAL_MS });

  while (!shuttingDown) {
    try {
      // De tempos em tempos, devolve à fila o que ficou presungo em `sending`
      // por causa de um worker que morreu no meio de um lote.
      if (cycles % STALLED_SWEEP_EVERY === 0) {
        await requeueStalledMessages();
        // Aproveita a mesma varredura periodica: cada IP distinto deixa uma
        // linha de rate limit por janela, e sem limpeza a tabela so cresce.
        await purgeExpiredRateLimits();
      }

      const processed = await runOnce();
      cycles += 1;

      // Só espera quando não havia nada: com fila cheia, emenda o próximo lote.
      if (processed === 0) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error("email.worker.cycle_failed", error);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  logger.info("email.worker.stopped");
}

function installSignalHandlers(): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      // Encerramento ordenado: o lote em andamento termina antes de sair, para
      // não deixar mensagens marcadas como `sending` sem ninguém cuidando.
      logger.info("email.worker.shutdown_requested", { signal });
      shuttingDown = true;
    });
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");

  if (once) {
    await requeueStalledMessages();
    await purgeExpiredRateLimits();
    const processed = await runOnce();
    logger.info("email.worker.batch_done", { processed });
    return;
  }

  installSignalHandlers();
  await runForever();
}

main()
  .catch((error) => {
    logger.error("email.worker.fatal", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
