import "server-only";

import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";

import {
  renderEmailTemplate,
  type TemplateContext,
} from "@/lib/email-template";

export type WorkflowEmailInput = {
  to: string[];
  cc?: string[];
  subjectTemplate: string;
  bodyTemplate: string;
  context: TemplateContext;
  replyTo?: string;
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

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
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
  const subject = renderEmailTemplate(input.subjectTemplate, input.context)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 998);
  const body = renderEmailTemplate(input.bodyTemplate, input.context);

  if (getEmailMode() === "log") {
    const providerId = `log-${randomUUID()}`;
    console.info("[email:log]", {
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
