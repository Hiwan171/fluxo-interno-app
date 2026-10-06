"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormSubmitResult } from "@/components/app/types";
import { signOut } from "@/lib/auth";
import { AuthorizationError, createBoardForCurrentUser } from "@/lib/dal";

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function slugify(value: string) {
  const base = value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "quadro"}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createBoardAction(
  workspaceId: string,
  formData: FormData,
): Promise<FormSubmitResult & { boardId?: string }> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Informe um nome para o quadro." };
  }

  const colorValue = String(formData.get("color") ?? "").trim();
  const iconValue = String(formData.get("icon") ?? "").trim();

  try {
    const board = await createBoardForCurrentUser({
      workspaceId,
      name,
      slug: slugify(name),
      color: colorValue || "#2563eb",
      icon: iconValue || null,
    });

    revalidatePath("/");
    return { success: true, boardId: board.id };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        error: "Você não tem permissão para criar quadros neste espaço de trabalho.",
      };
    }
    return { error: "Não foi possível criar o quadro." };
  }
}
