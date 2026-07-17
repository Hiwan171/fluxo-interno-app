"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";

export type LoginState = {
  error?: string;
};

function isSafeRedirect(target: FormDataEntryValue | null): target is string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//");
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = formData.get("next");

  const requestHeaders = await headers();
  const session = await signIn(
    { email, password },
    {
      ipAddress: requestHeaders.get("x-forwarded-for"),
      userAgent: requestHeaders.get("user-agent"),
    },
  );

  if (!session) {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect(isSafeRedirect(next) ? next : "/");
}
