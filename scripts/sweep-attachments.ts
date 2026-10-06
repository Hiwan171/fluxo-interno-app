import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { closeDb } from "../src/db/client";
import { sweepAttachments } from "../src/lib/attachment-gc";
import { logger } from "../src/lib/logger";

/**
 * Coleta anexos órfãos do volume.
 *
 * Rodar semanalmente é suficiente — o lixo se acumula devagar. Sugestão de
 * cron, depois do backup para que o arquivo removido ainda exista na cópia
 * mais recente:
 *
 *   30 4 * * 0 cd /caminho/fluxo-interno && npm run sweep:attachments
 */
async function main(): Promise<void> {
  const report = await sweepAttachments();

  console.log(
    [
      `Pendentes: ${report.pending.removed} removidos de ${report.pending.scanned}`,
      `Órfãos:    ${report.orphans.removed} removidos de ${report.orphans.scanned}`,
      `Liberado:  ${(
        (report.pending.reclaimedBytes + report.orphans.reclaimedBytes) /
        (1024 * 1024)
      ).toFixed(2)} MB`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    logger.error("attachments.sweep_failed", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
