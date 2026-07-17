"use server";

import { submitPublicIntakeForm } from "@/lib/public-forms";

export async function submitIntakeFormAction(
  publicKey: string,
  formData: FormData,
): Promise<{ success?: boolean; message?: string | null; error?: string }> {
  const values: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    values[key] = value === "true" ? true : value === "false" ? false : value;
  }

  try {
    const result = await submitPublicIntakeForm(publicKey, values);
    return { success: true, message: result.successMessage };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o formulário agora.",
    };
  }
}
