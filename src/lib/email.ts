import "server-only";

import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";

import {
  renderEmailTemplate,
  type TemplateContext,
} from "@/lib/email-template";
import { logger } from "@/lib/logger";

export type WorkflowEmailInput = {
  to: string[];
  cc?: string[];
  subjectTemplate: string;
  bodyTemplate: string;
  context: TemplateContext;
  replyTo?: string;
  /**
   * Trata assunto e corpo como texto final, sem passar pelo renderizador.
   *
   * Necessário para conteúdo escrito por uma pessoa e para mensagens já
   * renderizadas na entrada da fila: sem isto, qualquer `{{ algo }}` digitado
   * pelo usuário era substituído por string vazia — e o texto sumia da
   * mensagem sem qualquer aviso.
   */
  skipTemplating?: boolean;
};

export type WorkflowEmailResult =
  | { status: "LOGGED"; providerId: string; subject: string; body: string }
  | { status: "SENT"; providerId: string; subject: string; body: string };

let transporter: Transporter | null = null;

function getEmailMode() {
  return process.env.EMAIL_MODE === "smtp" ? "smtp" : "log";
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);

  if (!host || !Number.isFinite(port)) {
    throw new Error("SMTP_HOST e SMTP_PORT precisam ser configurados no modo smtp.");
  }

  const secure = process.env.SMTP_SECURE === "true";
  // Exigir STARTTLS e o padrao: sem isso o nodemailer segue em texto puro
  // quando o servidor nao anuncia a extensao, e a senha do SMTP vai junto.
  // So capturadores locais de desenvolvimento (Mailpit) precisam desligar.
  const requireTls = secure ? false : process.env.SMTP_REQUIRE_TLS !== "false";

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    // Na porta 587 a conexão abre em texto puro e sobe para TLS por STARTTLS.
    // Sem `requireTLS`, o nodemailer segue em claro caso o servidor não anuncie
    // a extensão — e a senha do SMTP iria junto. Exigir a subida transforma
    // isso em erro de conexão, que é o comportamento correto.
    requireTLS: requireTls,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    // Um servidor que não responde não pode segurar o worker indefinidamente:
    // a mensagem volta para a fila e é tentada de novo com backoff.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return transporter;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendWorkflowEmail(
  input: WorkflowEmailInput,
): Promise<WorkflowEmailResult> {
  const render = (template: string) =>
    input.skipTemplating
      ? template
      : renderEmailTemplate(template, input.context);

  const subject = render(input.subjectTemplate)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 998);
  const body = render(input.bodyTemplate);

  if (getEmailMode() === "log") {
    const providerId = `log-${randomUUID()}`;
    // Modo "log": registra o envelope, nunca o corpo da mensagem.
    logger.info("email.logged", {
      providerId,
      to: input.to,
      cc: input.cc,
      subject,
    });
    return { status: "LOGGED", providerId, subject, body };
  }

  const result = await getTransporter().sendMail({
    from: process.env.MAIL_FROM ?? "Fluxo Interno <noreply@localhost>",
    to: input.to,
    cc: input.cc,
    replyTo: input.replyTo,
    subject,
    text: body,
    html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`,
  });

  return {
    status: "SENT",
    providerId: result.messageId,
    subject,
    body,
  };
}
