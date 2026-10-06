"use server";

import { headers } from "next/headers";

import { setPasswordWithToken } from "@/lib/auth";
import { clientIdentifier, consumeRateLimit } from "@/lib/rate-limit";

export type SetPasswordState = {
  error?: string;
  success?: boolean;
};

/** Página pública: precisa do mesmo cuidado do login contra tentativa em massa. */
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

export async function setPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password !== confirmation) {
    return { error: "As senhas não conferem." };
  }

  const requestHeaders = await headers();
  const client = clientIdentifier(requestHeaders);

  const decision = consumeRateLimit(
    `set-password:${client}`,
    ATTEMPT_LIMIT,
    ATTEMPT_WINDOW_SECONDS,
  );

  if (!decision.allowed) {
    return {
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const result = await setPasswordWithToken(token, password, {
    ipAddress: client,
    userAgent: requestHeaders.get("user-agent"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return { success: true };
}
