import "server-only";

import { headers } from "next/headers";

/**
 * Base absoluta da aplicação, usada para montar links enviados por e-mail.
 *
 * `APP_URL` é a fonte preferencial porque é a única que continua correta quando
 * a mensagem sai de um contexto sem requisição (um worker, um cron). Sem ela,
 * reconstrói a partir dos cabeçalhos do proxy reverso.
 */
export async function resolveAppUrl(): Promise<string> {
  const configured = process.env.APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    return "http://localhost:3000";
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${protocol}://${host}`;
}

export async function buildAppLink(path: string): Promise<string> {
  const base = await resolveAppUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
