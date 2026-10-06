"use server";

import { headers } from "next/headers";

import {
  assertSubmissionWithinLimits,
  AttachmentValidationError,
  commitUploadedFiles,
  discardPendingFiles,
  saveUploadedFile,
  type UploadedFileMeta,
} from "@/lib/attachments";
import { submitPublicIntakeForm } from "@/lib/public-forms";
import { clientIdentifier, consumePersistentRateLimit } from "@/lib/rate-limit";

/**
 * Esta rota é acessível sem autenticação — qualquer pessoa com o link do
 * formulário chega aqui. Duas janelas: uma curta, que contém rajadas, e uma
 * longa, que impede o gotejamento constante capaz de encher o volume de anexos.
 *
 * O contador é persistido no Postgres, não guardado em memória: esta é a única
 * superfície alcançável da internet, e um limitador que zera ao reiniciar o
 * container reabriria a janela a cada deploy.
 */
const BURST_LIMIT = 5;
const BURST_WINDOW_SECONDS = 10 * 60;
const SUSTAINED_LIMIT = 30;
const SUSTAINED_WINDOW_SECONDS = 60 * 60;

type SubmitResult = {
  success?: boolean;
  message?: string | null;
  error?: string;
};

export async function submitIntakeFormAction(
  publicKey: string,
  formData: FormData,
): Promise<SubmitResult> {
  const client = clientIdentifier(await headers());

  for (const [limit, windowSeconds] of [
    [BURST_LIMIT, BURST_WINDOW_SECONDS],
    [SUSTAINED_LIMIT, SUSTAINED_WINDOW_SECONDS],
  ] as const) {
    const decision = await consumePersistentRateLimit(
      `intake:${windowSeconds}:${client}`,
      limit,
      windowSeconds,
    );

    if (!decision.allowed) {
      return {
        error:
          "Recebemos muitos envios deste endereço. Aguarde alguns minutos e tente novamente.",
      };
    }
  }

  const values: Record<string, unknown> = {};
  const fileEntriesByField = new Map<string, File[]>();

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (value.size === 0 && !value.name) continue;
      const list = fileEntriesByField.get(key) ?? [];
      list.push(value);
      fileEntriesByField.set(key, list);
      continue;
    }

    values[key] = value === "true" ? true : value === "false" ? false : value;
  }

  const pendingFiles: UploadedFileMeta[] = [];

  try {
    assertSubmissionWithinLimits(Array.from(fileEntriesByField.values()).flat());

    for (const [key, files] of fileEntriesByField) {
      const uploaded = await Promise.all(
        files.map((file) => saveUploadedFile(file)),
      );
      pendingFiles.push(...uploaded);
      values[key] = { kind: "attachment", files: uploaded };
    }
  } catch (error) {
    await discardPendingFiles(pendingFiles);

    return {
      error:
        error instanceof AttachmentValidationError
          ? error.message
          : "Não foi possível enviar o arquivo anexado.",
    };
  }

  try {
    const result = await submitPublicIntakeForm(publicKey, values);
    await commitUploadedFiles(pendingFiles);

    return { success: true, message: result.successMessage };
  } catch (error) {
    await discardPendingFiles(pendingFiles);

    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o formulário agora.",
    };
  }
}
