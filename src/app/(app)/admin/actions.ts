"use server";

import { revalidatePath } from "next/cache";

import type { FormSubmitResult } from "@/components/app/types";
import {
  AuthorizationError,
  ConflictError,
  createWorkspaceForCurrentUser,
  ResourceNotFoundError,
  setUserActiveForCurrentUser,
  setUserSystemRoleForCurrentUser,
} from "@/lib/dal";

function describe(error: unknown, fallback: string): FormSubmitResult {
  if (
    error instanceof ConflictError ||
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError
  ) {
    return { error: error.message };
  }

  return { error: fallback };
}

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<FormSubmitResult> {
  try {
    await setUserActiveForCurrentUser(userId, isActive);
  } catch (error) {
    return describe(error, "Não foi possível alterar o status do usuário.");
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function setUserSystemRoleAction(
  userId: string,
  systemRole: "admin" | "user",
): Promise<FormSubmitResult> {
  try {
    await setUserSystemRoleForCurrentUser(userId, systemRole);
  } catch (error) {
    return describe(error, "Não foi possível alterar o papel do usuário.");
  }

  revalidatePath("/admin");
  return { success: true };
}

const DIACRITICS = /[\u0300-\u036f]/g;

function slugify(value: string): string {
  return (
    value
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(DIACRITICS, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "espaco"
  );
}

export async function createWorkspaceAction(
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 2) {
    return { error: "Informe um nome para o espaço de trabalho." };
  }

  const slugInput = String(formData.get("slug") ?? "").trim();

  try {
    await createWorkspaceForCurrentUser({
      name,
      slug: slugInput ? slugify(slugInput) : slugify(name),
    });
  } catch (error) {
    return describe(error, "Não foi possível criar o espaço de trabalho.");
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}
