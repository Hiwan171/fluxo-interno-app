import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { resolveUploadsDir } from "@/lib/attachments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type CheckState = "ok" | "fail";

async function checkDatabase(): Promise<CheckState> {
  try {
    await getDb().execute(sql`select 1`);
    return "ok";
  } catch (error) {
    logger.error("health.database", error);
    return "fail";
  }
}

/**
 * O container roda `read_only`, então o volume de anexos é a única área
 * gravável — e se ela encher ou for montada errado, o upload quebra sem
 * qualquer outro sintoma. Escrever e apagar um arquivo é o que detecta isso.
 */
async function checkUploadsDir(): Promise<CheckState> {
  const probe = path.join(resolveUploadsDir(), ".health-probe");

  try {
    await writeFile(probe, String(Date.now()));
    await unlink(probe);
    return "ok";
  } catch (error) {
    logger.error("health.uploads", error);
    return "fail";
  }
}

export async function GET() {
  const [database, uploads] = await Promise.all([
    checkDatabase(),
    checkUploadsDir(),
  ]);

  const healthy = database === "ok" && uploads === "ok";

  // Só os nomes das verificações e o veredito. Mensagens de erro ficam no log
  // do servidor: este endpoint é alcançável sem autenticação.
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { database, uploads },
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
