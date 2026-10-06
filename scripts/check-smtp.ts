import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import nodemailer from "nodemailer";

/**
 * Verifica a configuração de SMTP antes de o sistema depender dela.
 *
 * O envio acontece dentro do worker, de forma assíncrona: uma credencial errada
 * vira uma linha de log e uma mensagem parada na fila, não um erro na cara de
 * quem cadastrou o usuário. Este script traz a falha para a frente.
 *
 *   npm run check:smtp                      # só testa a conexão e a autenticação
 *   npm run check:smtp -- voce@empresa.com  # envia uma mensagem de verdade
 */

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    console.error(`Faltando ${name} no .env`);
    process.exit(1);
  }

  return value;
}

async function main(): Promise<void> {
  const host = required("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const requireTls = secure ? false : process.env.SMTP_REQUIRE_TLS !== "false";
  const from = process.env.MAIL_FROM ?? "Fluxo Interno <noreply@localhost>";

  console.log("Configuração lida:");
  console.log(`  host        ${host}:${port}`);
  console.log(`  secure      ${secure}  (requireTLS=${requireTls})`);
  console.log(`  usuário     ${user || "(sem autenticação)"}`);
  console.log(`  remetente   ${from}`);

  if (process.env.EMAIL_MODE !== "smtp") {
    console.log(
      `\nAVISO: EMAIL_MODE=${process.env.EMAIL_MODE ?? "(vazio)"} — o sistema não vai entregar nada.`,
    );
    console.log("Defina EMAIL_MODE=smtp para o envio real acontecer.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: requireTls,
    auth:
      user && process.env.SMTP_PASSWORD
        ? { user, pass: process.env.SMTP_PASSWORD }
        : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  console.log("\n==> Conectando e autenticando...");
  await transporter.verify();
  console.log("OK: conexão e credenciais aceitas.");

  const destino = process.argv[2];

  if (!destino) {
    console.log("\nPara enviar uma mensagem de teste:");
    console.log("  npm run check:smtp -- voce@suaempresa.com.br");
    return;
  }

  console.log(`\n==> Enviando mensagem de teste para ${destino}...`);
  const info = await transporter.sendMail({
    from,
    to: destino,
    subject: "Teste de SMTP — Fluxo Interno",
    text:
      "Se você está lendo isto, o Fluxo Interno consegue enviar e-mail.\n\n" +
      "É por este caminho que saem os convites de acesso, as redefinições de " +
      "senha e as automações de fase.",
  });

  console.log(`OK: aceito pelo servidor (id ${info.messageId}).`);
  console.log(
    "Confira a caixa de entrada — e o spam, que é onde a primeira mensagem de um remetente novo costuma cair.",
  );
}

main().catch((error) => {
  console.error("\nFALHOU:", error instanceof Error ? error.message : error);
  console.error(
    "\nNo Microsoft 365 os motivos mais comuns são:\n" +
      "  - SMTP AUTH desativado na caixa (o padrão em tenants novos)\n" +
      "  - autenticação multifator na conta usada (crie uma caixa dedicada)\n" +
      "  - MAIL_FROM diferente do endereço autenticado em SMTP_USER",
  );
  process.exitCode = 1;
});
