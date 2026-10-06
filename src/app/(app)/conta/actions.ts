"use server";

import { headers } from "next/headers";

import { changeOwnPassword, getCurrentSession } from "@/lib/auth";
import { clientIdentifier, consumeRateLimit } from "@/lib/rate-limit";

export type ChangePasswordState = {
  error?: string;
  success?: boolean;
};

const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await getCurrentSession();

  if (!session) {
    return { error: "Sua sessão expirou. Entre novamente para continuar." };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password !== confirmation) {
    return { error: "As senhas não conferem." };
  }

  const requestHeaders = await headers();

  // Limita a tentativa de adivinhar a senha atual a partir de uma sessão
  // sequestrada.
  const decision = consumeRateLimit(
    `change-password:${session.userId}`,
    ATTEMPT_LIMIT,
    ATTEMPT_WINDOW_SECONDS,
  );

  if (!decision.allowed) {
    return {
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const result = await changeOwnPassword(
    session.userId,
    currentPassword,
    password,
    {
      ipAddress: clientIdentifier(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    },
  );

  if (!result.ok) {
    return { error: result.error };
  }

  return { success: true };
}
