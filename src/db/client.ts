import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __fluxoPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __fluxoDb: Database | undefined;
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error(
      "DATABASE_URL não foi definida. Configure a conexão PostgreSQL antes de acessar o banco.",
    );
  }

  return value;
}

export function getPool(): Pool {
  if (!globalThis.__fluxoPool) {
    globalThis.__fluxoPool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return globalThis.__fluxoPool;
}

export function getDb(): Database {
  if (!globalThis.__fluxoDb) {
    globalThis.__fluxoDb = drizzle(getPool(), { schema });
  }

  return globalThis.__fluxoDb;
}

export async function closeDb(): Promise<void> {
  const pool = globalThis.__fluxoPool;

  globalThis.__fluxoDb = undefined;
  globalThis.__fluxoPool = undefined;

  if (pool) {
    await pool.end();
  }
}

export { schema };
export type { Database };
