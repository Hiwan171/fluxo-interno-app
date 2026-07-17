"use server";

import { revalidatePath } from "next/cache";

import type { FormSubmitResult } from "@/components/app/types";
import {
  addBoardMemberForCurrentUser,
  addWorkspaceMemberForCurrentUser,
  archiveCustomFieldForCurrentUser,
  ConflictError,
  createCustomFieldForCurrentUser,
  createFormFieldForCurrentUser,
  createIntakeFormForCurrentUser,
  deleteFormFieldForCurrentUser,
  deleteIntakeFormForCurrentUser,
  listCustomFieldsForBoard,
  moveFormFieldForCurrentUser,
  removeBoardMemberForCurrentUser,
  removeWorkspaceMemberForCurrentUser,
  updateBoardMemberRoleForCurrentUser,
  updateCustomFieldForCurrentUser,
  updateFormFieldForCurrentUser,
  updateIntakeFormForCurrentUser,
  updateWorkspaceMemberRoleForCurrentUser,
} from "@/lib/dal";
import type { BoardMemberRole, WorkspaceRole } from "@/db/schema";

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function slugifyFieldKey(label: string) {
  const cleaned = label
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = /^[a-z]/.test(cleaned) ? cleaned : `campo_${cleaned}`;

  return `${(base || "campo").slice(0, 60)}_${Math.random().toString(36).slice(2, 6)}`;
}

const FIELD_TYPE_OPTIONS = [
  "short_text",
  "long_text",
  "number",
  "date",
  "checkbox",
  "select",
  "email",
] as const;
type BasicFieldType = (typeof FIELD_TYPE_OPTIONS)[number];

function parseOptions(raw: string) {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ label: value, value: value.toLowerCase() }));
}

function manageRevalidate(boardId: string) {
  revalidatePath(`/boards/${boardId}/manage`);
}

/**
 * Radix `Select` submits an empty string (not an absent field) when no
 * option was ever chosen, so `formData.get(x) ?? fallback` does not catch
 * that case. Validate against the allowed set instead.
 */
function pickEnum<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = String(value ?? "");
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export async function addBoardMemberAction(
  boardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const userId = String(formData.get("userId") ?? "");
  const role = pickEnum(
    formData.get("role"),
    ["viewer", "editor", "manager"] as const,
    "viewer",
  ) satisfies BoardMemberRole;

  if (!userId) {
    return { error: "Selecione um usuário." };
  }

  try {
    await addBoardMemberForCurrentUser(boardId, { userId, role });
  } catch (error) {
    if (error instanceof ConflictError) {
      return { error: error.message };
    }
    return { error: "Não foi possível adicionar o membro." };
  }

  manageRevalidate(boardId);
  return { success: true };
}

export async function updateBoardMemberRoleAction(
  boardId: string,
  userId: string,
  role: BoardMemberRole,
) {
  await updateBoardMemberRoleForCurrentUser(boardId, userId, role);
  manageRevalidate(boardId);
}

export async function removeBoardMemberAction(boardId: string, userId: string) {
  await removeBoardMemberForCurrentUser(boardId, userId);
  manageRevalidate(boardId);
}

export async function addWorkspaceMemberAction(
  boardId: string,
  workspaceId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = pickEnum(
    formData.get("role"),
    ["viewer", "member", "admin", "owner"] as const,
    "member",
  ) satisfies WorkspaceRole;

  if (!email || !name) {
    return { error: "Informe nome e e-mail." };
  }

  try {
    await addWorkspaceMemberForCurrentUser(workspaceId, { email, name, role });
    manageRevalidate(boardId);
    return { success: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { error: error.message };
    }
    return { error: "Não foi possível adicionar o membro." };
  }
}

export async function updateWorkspaceMemberRoleAction(
  boardId: string,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
) {
  await updateWorkspaceMemberRoleForCurrentUser(workspaceId, userId, role);
  manageRevalidate(boardId);
}

export async function removeWorkspaceMemberAction(
  boardId: string,
  workspaceId: string,
  userId: string,
) {
  try {
    await removeWorkspaceMemberForCurrentUser(workspaceId, userId);
  } catch (error) {
    if (error instanceof ConflictError) {
      throw new Error(error.message);
    }
    throw error;
  }
  manageRevalidate(boardId);
}

export async function createCustomFieldAction(
  boardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const label = String(formData.get("label") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const type = pickEnum(formData.get("type"), FIELD_TYPE_OPTIONS, "short_text");
  const isRequired = formData.get("isRequired") === "true";
  const optionsRaw = String(formData.get("options") ?? "").trim();

  if (!label || !key) {
    return { error: "Informe a chave e o rótulo do campo." };
  }

  const options = type === "select" ? parseOptions(optionsRaw) : undefined;

  try {
    await createCustomFieldForCurrentUser({
      boardId,
      key,
      label,
      type,
      isRequired,
      config: options ? { options } : {},
    });
  } catch {
    return { error: "Não foi possível criar o campo. Verifique a chave (letras minúsculas, números e _)." };
  }

  manageRevalidate(boardId);
  return { success: true };
}

export async function updateCustomFieldAction(
  boardId: string,
  fieldId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const label = String(formData.get("label") ?? "").trim();
  const isRequired = formData.get("isRequired") === "true";

  if (!label) {
    return { error: "Informe o rótulo do campo." };
  }

  try {
    await updateCustomFieldForCurrentUser(fieldId, { label, isRequired });
  } catch {
    return { error: "Não foi possível salvar as alterações." };
  }

  manageRevalidate(boardId);
  return { success: true };
}

export async function archiveCustomFieldAction(boardId: string, fieldId: string) {
  await archiveCustomFieldForCurrentUser(fieldId);
  manageRevalidate(boardId);
}

export async function createIntakeFormAction(
  boardId: string,
  workspaceId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();
  const targetPhaseId = String(formData.get("targetPhaseId") ?? "").trim();
  const status = pickEnum(
    formData.get("status"),
    ["draft", "published", "closed"] as const,
    "draft",
  );
  const requireRequesterEmail = formData.get("requireRequesterEmail") === "true";

  if (!name) {
    return { error: "Informe um nome para o formulário." };
  }

  try {
    const form = await createIntakeFormForCurrentUser({
      workspaceId,
      boardId,
      targetPhaseId: targetPhaseId || null,
      name,
      status,
      requireRequesterEmail,
    });

    await createFormFieldForCurrentUser({
      formId: form.id,
      targetField: "title",
      type: "short_text",
      label: "Título da solicitação",
      isRequired: true,
      position: 0,
    });

    await createFormFieldForCurrentUser({
      formId: form.id,
      targetField: "description",
      type: "long_text",
      label: "Descrição",
      isRequired: false,
      position: 1,
    });

    if (requireRequesterEmail) {
      await createFormFieldForCurrentUser({
        formId: form.id,
        targetField: "requester_email",
        type: "email",
        label: "Seu e-mail",
        isRequired: true,
        position: 2,
      });
    }
  } catch {
    return { error: "Não foi possível criar o formulário." };
  }

  manageRevalidate(boardId);
  return { success: true };
}

export async function updateIntakeFormStatusAction(
  boardId: string,
  formId: string,
  status: "draft" | "published" | "closed",
) {
  await updateIntakeFormForCurrentUser(formId, { status });
  manageRevalidate(boardId);
}

export async function deleteIntakeFormAction(boardId: string, formId: string) {
  await deleteIntakeFormForCurrentUser(formId);
  manageRevalidate(boardId);
}

const FIELD_TYPE_BY_TARGET: Record<string, BasicFieldType> = {
  title: "short_text",
  description: "long_text",
  requester_name: "short_text",
  requester_email: "email",
};

export async function addFormFieldAction(
  boardId: string,
  formId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const label = String(formData.get("label") ?? "").trim();
  const binding = String(formData.get("binding") ?? "new");
  const type = pickEnum(formData.get("type"), FIELD_TYPE_OPTIONS, "short_text");
  const isRequired = formData.get("isRequired") === "true";
  const options = type === "select" ? parseOptions(String(formData.get("options") ?? "")) : [];

  if (!label) {
    return { error: "Informe um rótulo para o campo." };
  }

  try {
    if (binding in FIELD_TYPE_BY_TARGET) {
      await createFormFieldForCurrentUser({
        formId,
        targetField: binding as "title" | "description" | "requester_name" | "requester_email",
        type: FIELD_TYPE_BY_TARGET[binding],
        label,
        isRequired,
      });
    } else if (binding.startsWith("existing:")) {
      const customFieldId = binding.slice("existing:".length);
      const boardFields = await listCustomFieldsForBoard(boardId);
      const existing = boardFields.find((field) => field.id === customFieldId);

      if (!existing) {
        return { error: "Campo selecionado não encontrado." };
      }

      const existingOptions = Array.isArray(
        (existing.config as { options?: unknown })?.options,
      )
        ? (existing.config as { options: Array<{ label: string; value: string }> })
            .options
        : [];

      await createFormFieldForCurrentUser({
        formId,
        customFieldId: existing.id,
        type: existing.type,
        label: existing.label,
        isRequired,
        options: existingOptions,
      });
    } else {
      const field = await createCustomFieldForCurrentUser({
        boardId,
        key: slugifyFieldKey(label),
        label,
        type,
        isRequired,
        config: options.length ? { options } : {},
      });

      await createFormFieldForCurrentUser({
        formId,
        customFieldId: field.id,
        type,
        label,
        isRequired,
        options,
      });
    }
  } catch {
    return { error: "Não foi possível adicionar o campo." };
  }

  manageRevalidate(boardId);
  return { success: true };
}

export async function updateFormFieldAction(
  boardId: string,
  fieldId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const label = String(formData.get("label") ?? "").trim();
  const isRequired = formData.get("isRequired") === "true";
  const optionsRaw = String(formData.get("options") ?? "").trim();

  if (!label) {
    return { error: "Informe um rótulo para o campo." };
  }

  try {
    await updateFormFieldForCurrentUser(fieldId, {
      label,
      isRequired,
      ...(optionsRaw ? { options: parseOptions(optionsRaw) } : {}),
    });
  } catch {
    return { error: "Não foi possível salvar as alterações." };
  }

  manageRevalidate(boardId);
  return { success: true };
}

export async function deleteFormFieldAction(boardId: string, fieldId: string) {
  await deleteFormFieldForCurrentUser(fieldId);
  manageRevalidate(boardId);
}

export async function moveFormFieldAction(
  boardId: string,
  fieldId: string,
  direction: "left" | "right",
) {
  await moveFormFieldForCurrentUser(fieldId, direction);
  manageRevalidate(boardId);
}
