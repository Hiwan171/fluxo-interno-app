import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class AttachmentValidationError extends Error {}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Limites por submissão, aplicados pelos chamadores (card e formulário público). */
export const MAX_FILES_PER_SUBMISSION = 10;
export const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Allowlist explícita. `file.type` chega do cliente e não é confiável, então o
 * tipo declarado só serve para escolher a assinatura que o conteúdo precisa
 * casar — quem decide é `sniffMimeType`. Formatos capazes de executar script na
 * origem da aplicação (SVG à frente de todos) ficam de fora de propósito.
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};

export const ALLOWED_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);

/**
 * Tipos que podem ser servidos com `Content-Disposition: inline`. São formatos
 * que o navegador renderiza sem executar script do autor do arquivo — e todos
 * passaram pela verificação de assinatura no upload.
 */
const INLINE_SAFE_MIME_TYPES = new Set(ALLOWED_MIME_TYPES);

export function canBeServedInline(mimeType: string): boolean {
  return INLINE_SAFE_MIME_TYPES.has(mimeType);
}

type Signature = {
  mimeType: string;
  offset: number;
  bytes: number[];
};

const SIGNATURES: Signature[] = [
  { mimeType: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  {
    mimeType: "image/png",
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mimeType: "image/gif", offset: 0, bytes: [...Buffer.from("GIF87a")] },
  { mimeType: "image/gif", offset: 0, bytes: [...Buffer.from("GIF89a")] },
  { mimeType: "video/webm", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mimeType: "application/pdf", offset: 0, bytes: [...Buffer.from("%PDF-")] },
];

/** WebP é RIFF com o marcador "WEBP" no offset 8. */
function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  );
}

/**
 * MP4 e MOV compartilham o contêiner ISO-BMFF: caixa `ftyp` no offset 4, e a
 * marca no offset 8 separa os dois.
 */
function isoBaseMediaType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(4, 8).toString("latin1") !== "ftyp") return null;

  const brand = buffer.subarray(8, 12).toString("latin1");
  return brand === "qt  " ? "video/quicktime" : "video/mp4";
}

function matches(buffer: Buffer, signature: Signature): boolean {
  const end = signature.offset + signature.bytes.length;
  if (buffer.length < end) return false;

  return signature.bytes.every(
    (byte, index) => buffer[signature.offset + index] === byte,
  );
}

/** Determina o tipo pelo conteúdo. Retorna null quando não reconhece. */
export function sniffMimeType(buffer: Buffer): string | null {
  if (isWebp(buffer)) return "image/webp";

  const isoType = isoBaseMediaType(buffer);
  if (isoType) return isoType;

  return SIGNATURES.find((signature) => matches(buffer, signature))?.mimeType ?? null;
}

export function resolveUploadsDir() {
  const configured = process.env.UPLOADS_DIR;
  return path.resolve(configured && configured.trim() ? configured : "./uploads");
}

function resolveTempDir() {
  return path.join(resolveUploadsDir(), ".pending");
}

const RESERVED_FILENAME_CHARS = new Set([
  "<", ">", ":", '"', "/", "\\", "|", "?", "*",
]);

/**
 * Mantém só o nome base, sem separadores de caminho nem caracteres de controle.
 * O nome é usado no cabeçalho de download e exibido na interface; o arquivo em
 * si é gravado sob um UUID.
 */
function sanitizeFileName(rawName: string, extension: string): string {
  const base = Array.from(path.basename(rawName || ""))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      // Descarta controles C0, DEL e os reservados por sistemas de arquivos.
      return code > 31 && code !== 127 && !RESERVED_FILENAME_CHARS.has(char);
    })
    .join("")
    .trim()
    .slice(0, 200);

  return base || `arquivo${extension}`;
}

export type UploadedFileMeta = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Grava em `.pending` e devolve a referência. O arquivo só entra no diretório
 * definitivo quando `commitUploadedFiles` é chamado, depois que a transação que
 * registra o anexo tiver sido confirmada — assim uma transação abortada não
 * deixa lixo permanente no volume.
 */
export async function saveUploadedFile(file: File): Promise<UploadedFileMeta> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AttachmentValidationError(
      `Arquivo muito grande. O limite é ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // `file.size` vem do cliente; o tamanho real é o do buffer.
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new AttachmentValidationError(
      `Arquivo muito grande. O limite é ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
    );
  }

  if (buffer.byteLength === 0) {
    throw new AttachmentValidationError("O arquivo enviado está vazio.");
  }

  const mimeType = sniffMimeType(buffer);

  if (!mimeType) {
    throw new AttachmentValidationError(
      "Tipo de arquivo não suportado. Envie imagem (JPG, PNG, GIF, WebP), vídeo (MP4, WebM, MOV) ou PDF.",
    );
  }

  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  const tempDir = resolveTempDir();
  await mkdir(tempDir, { recursive: true });

  const storageKey = `${randomUUID()}${extension}`;
  await writeFile(path.join(tempDir, storageKey), buffer);

  return {
    storageKey,
    fileName: sanitizeFileName(file.name, extension),
    mimeType,
    sizeBytes: buffer.byteLength,
  };
}

/** Valida os limites agregados de uma submissão antes de gravar qualquer coisa. */
export function assertSubmissionWithinLimits(files: File[]): void {
  if (files.length > MAX_FILES_PER_SUBMISSION) {
    throw new AttachmentValidationError(
      `Envie no máximo ${MAX_FILES_PER_SUBMISSION} arquivos por vez.`,
    );
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);

  if (total > MAX_TOTAL_UPLOAD_BYTES) {
    throw new AttachmentValidationError(
      `O total de anexos excede ${Math.floor(MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024))}MB.`,
    );
  }
}

function assertSafeStorageKey(storageKey: string): void {
  if (
    !storageKey ||
    storageKey !== path.basename(storageKey) ||
    storageKey.includes("..")
  ) {
    throw new AttachmentValidationError("Referência de arquivo inválida.");
  }
}

/** Promove arquivos pendentes ao diretório definitivo após o commit. */
export async function commitUploadedFiles(
  files: UploadedFileMeta[],
): Promise<void> {
  if (files.length === 0) return;

  const uploadsDir = resolveUploadsDir();
  await mkdir(uploadsDir, { recursive: true });

  for (const file of files) {
    assertSafeStorageKey(file.storageKey);
    await rename(
      path.join(resolveTempDir(), file.storageKey),
      path.join(uploadsDir, file.storageKey),
    );
  }
}

/** Remove arquivos pendentes de uma operação que falhou. Nunca lança. */
export async function discardPendingFiles(
  files: UploadedFileMeta[],
): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      try {
        assertSafeStorageKey(file.storageKey);
        await unlink(path.join(resolveTempDir(), file.storageKey));
      } catch {
        // Já removido ou nunca gravado — nada a fazer.
      }
    }),
  );
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  assertSafeStorageKey(storageKey);

  return readFile(path.join(resolveUploadsDir(), storageKey));
}
