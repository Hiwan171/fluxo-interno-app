import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { and, eq, isNull, sql } from "drizzle-orm";

import { closeDb, getDb, schema } from "../src/db/client";
import { hashPassword } from "../src/lib/auth/password";
import { emailSchema, passwordSchema } from "../src/lib/validation";

/**
 * Define a senha de um usuário e encerra as sessões e convites abertos dele.
 *
 * Serve para o caso de a senha de um administrador ser esquecida (ou ter vazado)
 * e não haver como recuperá-la por e-mail. A senha vem do ambiente, nunca de um
 * argumento, para não ficar no histórico do terminal:
 *
 *   USER_EMAIL=voce@empresa.com.br NEW_PASSWORD=... npm run set:password
 */

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

async function main() {
  const rawEmail = process.env.USER_EMAIL;
  const password = process.env.NEW_PASSWORD;

  if (!rawEmail) fail("defina USER_EMAIL.");
  if (!password) fail("defina NEW_PASSWORD.");

  const parsedEmail = emailSchema.safeParse(rawEmail);
  if (!parsedEmail.success) fail(parsedEmail.error.issues[0]?.message ?? "e-mail inválido.");

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) fail(parsedPassword.error.issues[0]?.message ?? "senha inválida.");

  const { users, sessions, authTokens, auditLogs } = schema;
  const email = parsedEmail.data;
  const db = getDb();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!user) fail(`nenhum usuário com o e-mail ${email}.`);

  const passwordHash = await hashPassword(password);

  const closed = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    // Quem estiver logado com a senha antiga é desconectado.
    const revoked = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });

    // Convites e links de redefinição pendentes deixam de valer.
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.userId, user.id), isNull(authTokens.usedAt)));

    await tx.insert(auditLogs).values({
      actorId: null,
      action: "user.password_set_by_script",
      entityType: "user",
      entityId: user.id,
      details: { sessionsRevoked: revoked.length },
    });

    return revoked.length;
  });

  console.log(`Senha de ${email} atualizada. ${closed} sessão(ões) encerrada(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
