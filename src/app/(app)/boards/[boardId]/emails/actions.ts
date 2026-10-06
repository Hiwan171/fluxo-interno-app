"use server";

import { revalidatePath } from "next/cache";

import type { FormSubmitResult } from "@/components/app/types";
import {
  createEmailAutomationForCurrentUser,
  createEmailTemplateForCurrentUser,
  deleteEmailAutomationForCurrentUser,
  deleteEmailTemplateForCurrentUser,
  markEmailReadForCurrentUser,
  updateEmailAutomationForCurrentUser,
  updateEmailTemplateForCurrentUser,
} from "@/lib/dal";

export async function markEmailReadAction(emailId: string) {
  await markEmailReadForCurrentUser(emailId);
}

export async function createEmailTemplateAction(
  boardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const textBody = String(formData.get("textBody") ?? "").trim();

  if (!name || !subject || !textBody) {
    return { error: "Preencha nome, assunto e corpo do modelo." };
  }

  try {
    await createEmailTemplateForCurrentUser({ boardId, name, subject, textBody });
  } catch {
    return { error: "Não foi possível criar o modelo." };
  }

  revalidatePath(`/boards/${boardId}/emails/templates`);
  return { success: true };
}

export async function updateEmailTemplateAction(
  boardId: string,
  templateId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const textBody = String(formData.get("textBody") ?? "").trim();

  if (!name || !subject || !textBody) {
    return { error: "Preencha nome, assunto e corpo do modelo." };
  }

  try {
    await updateEmailTemplateForCurrentUser(templateId, { name, subject, textBody });
  } catch {
    return { error: "Não foi possível salvar as alterações." };
  }

  revalidatePath(`/boards/${boardId}/emails/templates`);
  return { success: true };
}

export async function toggleEmailTemplateAction(
  boardId: string,
  templateId: string,
  isActive: boolean,
) {
  await updateEmailTemplateForCurrentUser(templateId, { isActive });
  revalidatePath(`/boards/${boardId}/emails/templates`);
}

export async function deleteEmailTemplateAction(boardId: string, templateId: string) {
  await deleteEmailTemplateForCurrentUser(templateId);
  revalidatePath(`/boards/${boardId}/emails/templates`);
}

export async function createEmailAutomationAction(
  boardId: string,
  formData: FormData,
): Promise<FormSubmitResult> {
  const name = String(formData.get("name") ?? "").trim();
  const triggerPhaseId = String(formData.get("triggerPhaseId") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const recipientEmailsRaw = String(formData.get("recipientEmails") ?? "").trim();
  const recipientEmails = recipientEmailsRaw
    .split(/[,;\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!name || !triggerPhaseId || !templateId) {
    return { error: "Preencha nome, fase de gatilho e modelo de e-mail." };
  }

  try {
    await createEmailAutomationForCurrentUser({
      boardId,
      name,
      triggerPhaseId,
      templateId,
      recipientEmails,
    });
  } catch {
    return { error: "Não foi possível criar a automação." };
  }

  revalidatePath(`/boards/${boardId}/emails/automations`);
  return { success: true };
}

export async function toggleEmailAutomationAction(
  boardId: string,
  automationId: string,
  isActive: boolean,
) {
  await updateEmailAutomationForCurrentUser(automationId, { isActive });
  revalidatePath(`/boards/${boardId}/emails/automations`);
}

export async function deleteEmailAutomationAction(
  boardId: string,
  automationId: string,
) {
  await deleteEmailAutomationForCurrentUser(automationId);
  revalidatePath(`/boards/${boardId}/emails/automations`);
}
