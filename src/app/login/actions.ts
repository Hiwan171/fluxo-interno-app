"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { clientIdentifier } from "@/lib/rate-limit";

export type LoginState = {
  error?: string;
};

function isSafeRedirect(target: FormDataEntryValue | null): target is string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//");
}

function describeWait(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);

  return minutes <= 1 ? "cerca de 1 minuto" : `cerca de ${minutes} minutos`;
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = formData.get("next");

  const requestHeaders = await headers();
  const result = await signIn(
    { email, password },
    {
      ipAddress: clientIdentifier(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    },
  );

  if (!result.ok) {
    if (result.reason === "throttled") {
      return {
        error: `Muitas tentativas de acesso. Tente novamente em ${describeWait(result.retryAfterSeconds)}.`,
      };
    }

    return { error: "E-mail ou senha inválidos." };
  }

  redirect(isSafeRedirect(next) ? next : "/");
}
