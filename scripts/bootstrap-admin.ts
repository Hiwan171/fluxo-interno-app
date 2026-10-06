import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { and, eq, sql } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client";
import { users, workspaceMembers, workspaces } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { emailSchema, passwordSchema } from "../src/lib/validation";

/**
 * Cria o primeiro administrador de um ambiente novo, sem dados de demonstração.
 *
 * Diferente de `seed.ts`, que existe para desenvolvimento (senha fixa, quadro e
 * cards de exemplo), aqui a senha vem do ambiente e nunca é impressa. Passe-a
 * por variável de ambiente do `docker compose run`, não por arquivo `.env`, para
 * que ela não fique gravada em disco. Veja DEPLOY.md.
 *
 * É idempotente: se o e-mail já existe, não altera nada.
 */

const WORKSPACE_NAME = "Fluxo Interno";
const WORKSPACE_SLUG = "fluxo-interno";

// A senha do seed de desenvolvimento está no repositório; usá-la aqui deixaria
// um administrador com credencial pública.
const KNOWN_DEV_PASSWORD = "TrocarSenha123!";

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

async function main() {
  const rawEmail = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";

  if (!rawEmail) fail("defina ADMIN_EMAIL.");
  if (!password) fail("defina ADMIN_PASSWORD.");
  if (password === KNOWN_DEV_PASSWORD) {
    fail("essa senha é a do seed de desenvolvimento. Escolha outra.");
  }

  const parsedEmail = emailSchema.safeParse(rawEmail);
  if (!parsedEmail.success) {
    fail(parsedEmail.error.issues[0]?.message ?? "e-mail inválido.");
  }

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    fail(parsedPassword.error.issues[0]?.message ?? "senha inválida.");
  }

  const email = parsedEmail.data;
  const db = getDb();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing) {
    console.log(`Usuário ${email} já existe. Nada foi alterado.`);
    return;
  }

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(users)
      .values({ email, passwordHash, name, systemRole: "admin" })
      .returning({ id: users.id });

    let [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, WORKSPACE_SLUG))
      .limit(1);

    if (!workspace) {
      [workspace] = await tx
        .insert(workspaces)
        .values({
          name: WORKSPACE_NAME,
          slug: WORKSPACE_SLUG,
          createdBy: admin.id,
        })
        .returning({ id: workspaces.id });
    }

    const [membership] = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.userId, admin.id),
        ),
      )
      .limit(1);

    if (!membership) {
      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: admin.id,
        role: "owner",
      });
    }
  });

  console.log(`Administrador criado: ${email}`);
  console.log("Entre no sistema e crie os quadros pela interface.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
