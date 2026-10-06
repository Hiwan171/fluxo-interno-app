import "server-only";

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { attachments } from "@/db/schema";
import { resolveUploadsDir } from "@/lib/attachments";
import { logger } from "@/lib/logger";

/**
 * Coleta de anexos órfãos.
 *
 * Duas fontes de lixo, com causas diferentes:
 *
 * 1. `.pending` — arquivos gravados para uma transação que acabou falhando. O
 *    caminho normal os remove, mas um processo derrubado no meio deixa restos.
 * 2. Diretório definitivo — apagar um card faz cascade nas tabelas e o arquivo
 *    fica no volume para sempre. Sem esta varredura, o armazenamento só cresce.
 */

/**
 * Margem antes de considerar um arquivo pendente abandonado. Um upload em curso
 * ainda não tem linha no banco; apagar por idade curta removeria arquivo em uso.
 */
const PENDING_GRACE_MINUTES = 60;

/**
 * Mesma proteção para o diretório definitivo: entre gravar o arquivo e
 * confirmar a transação existe uma janela em que ele legitimamente não tem
 * referência no banco.
 */
const ORPHAN_GRACE_MINUTES = 60;

const BATCH_SIZE = 500;

export type SweepResult = {
  scanned: number;
  removed: number;
  reclaimedBytes: number;
};

async function olderThan(filePath: string, minutes: number): Promise<boolean> {
  const info = await stat(filePath);
  return Date.now() - info.mtimeMs > minutes * 60_000;
}

async function removeIfStale(
  filePath: string,
  minutes: number,
): Promise<number> {
  try {
    if (!(await olderThan(filePath, minutes))) return 0;

    const info = await stat(filePath);
    await unlink(filePath);
    return info.size;
  } catch {
    // Some entre o `stat` e o `unlink`, ou permissão negada: seguir adiante é
    // preferível a abortar a varredura inteira por um arquivo.
    return 0;
  }
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    // Diretório ainda não criado é situação normal numa instalação nova.
    return [];
  }
}

/** Remove restos de uploads que nunca chegaram a ser confirmados. */
async function sweepPending(): Promise<SweepResult> {
  const pendingDir = path.join(resolveUploadsDir(), ".pending");
  const names = await listFiles(pendingDir);

  let removed = 0;
  let reclaimedBytes = 0;

  for (const name of names) {
    const size = await removeIfStale(
      path.join(pendingDir, name),
      PENDING_GRACE_MINUTES,
    );

    if (size > 0) {
      removed += 1;
      reclaimedBytes += size;
    }
  }

  return { scanned: names.length, removed, reclaimedBytes };
}

/** Remove arquivos do diretório definitivo que nenhuma linha referencia. */
async function sweepOrphans(): Promise<SweepResult> {
  const uploadsDir = resolveUploadsDir();
  const names = await listFiles(uploadsDir);

  let removed = 0;
  let reclaimedBytes = 0;

  // Em lotes: um `in (...)` com dezenas de milhares de chaves é pior para o
  // planejador do que várias consultas menores.
  for (let offset = 0; offset < names.length; offset += BATCH_SIZE) {
    const batch = names.slice(offset, offset + BATCH_SIZE);

    const referenced = await getDb()
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(inArray(attachments.storageKey, batch));

    const known = new Set(referenced.map((row) => row.storageKey));

    for (const name of batch) {
      if (known.has(name)) continue;

      const size = await removeIfStale(
        path.join(uploadsDir, name),
        ORPHAN_GRACE_MINUTES,
      );

      if (size > 0) {
        removed += 1;
        reclaimedBytes += size;
      }
    }
  }

  return { scanned: names.length, removed, reclaimedBytes };
}

export type AttachmentSweepReport = {
  pending: SweepResult;
  orphans: SweepResult;
};

export async function sweepAttachments(): Promise<AttachmentSweepReport> {
  const pending = await sweepPending();
  const orphans = await sweepOrphans();

  logger.info("attachments.sweep_done", {
    pendingRemoved: pending.removed,
    orphansRemoved: orphans.removed,
    reclaimedBytes: pending.reclaimedBytes + orphans.reclaimedBytes,
  });

  return { pending, orphans };
}
