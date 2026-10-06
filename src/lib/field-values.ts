import "server-only";

import type { UploadedFileMeta } from "@/lib/attachments";

/**
 * Normalização e validação de valores de campo personalizado.
 *
 * O formato de armazenamento é `jsonb`, o que significa que nada no banco
 * impede gravar 20 MB de texto num campo numérico. Antes destas funções, o
 * schema aceitava `z.record(uuid, z.unknown())` e o valor ia direto para a
 * tabela — sem conferir tipo, tamanho nem se a opção escolhida existia.
 *
 * A validação acontece contra a definição do campo carregada do banco, nunca
 * contra o que o cliente afirma sobre ele.
 */

export class FieldValidationError extends Error {
  readonly status = 422;
  readonly code = "INVALID_FIELD_VALUE";

  constructor(
    message: string,
    readonly fieldLabel: string,
  ) {
    super(message);
    this.name = "FieldValidationError";
  }
}

export type FieldDefinition = {
  id: string;
  label: string;
  type: string;
  config: Record<string, unknown>;
  isRequired: boolean;
};

const MAX_SHORT_TEXT = 500;
const MAX_LONG_TEXT = 20_000;
const MAX_MULTISELECT_ITEMS = 50;

type PendingAttachmentValue = {
  kind: "attachment";
  files: UploadedFileMeta[];
};

export function isPendingAttachmentValue(
  value: unknown,
): value is PendingAttachmentValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "attachment" &&
    Array.isArray((value as { files?: unknown }).files)
  );
}

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function optionsFor(field: FieldDefinition): string[] {
  const raw = (field.config as { options?: unknown }).options;

  if (!Array.isArray(raw)) return [];

  return raw
    .map((option) =>
      typeof option === "object" && option !== null
        ? String((option as { value?: unknown }).value ?? "")
        : String(option),
    )
    .filter(Boolean);
}

function asText(value: unknown, field: FieldDefinition, maxLength: number): string {
  if (typeof value !== "string") {
    throw new FieldValidationError(
      `O campo "${field.label}" espera texto.`,
      field.label,
    );
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new FieldValidationError(
      `O campo "${field.label}" excede o limite de ${maxLength} caracteres.`,
      field.label,
    );
  }

  return trimmed;
}

function asNumber(value: unknown, field: FieldDefinition): number {
  // Formulários HTML entregam tudo como string; converter aqui evita gravar
  // "12" onde o restante do sistema espera 12.
  const parsed = typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isFinite(parsed)) {
    throw new FieldValidationError(
      `O campo "${field.label}" espera um número.`,
      field.label,
    );
  }

  const { min, max } = field.config as { min?: unknown; max?: unknown };

  if (typeof min === "number" && parsed < min) {
    throw new FieldValidationError(
      `O campo "${field.label}" deve ser no mínimo ${min}.`,
      field.label,
    );
  }

  if (typeof max === "number" && parsed > max) {
    throw new FieldValidationError(
      `O campo "${field.label}" deve ser no máximo ${max}.`,
      field.label,
    );
  }

  return parsed;
}

function asDate(value: unknown, field: FieldDefinition): string {
  const parsed = Date.parse(String(value));

  if (!Number.isFinite(parsed)) {
    throw new FieldValidationError(
      `O campo "${field.label}" espera uma data válida.`,
      field.label,
    );
  }

  return new Date(parsed).toISOString();
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

function asChoice(value: unknown, field: FieldDefinition): string {
  const choice = String(value);
  const allowed = optionsFor(field);

  // Uma lista de opções vazia significa campo mal configurado, não campo
  // livre — recusar aqui é melhor do que aceitar qualquer coisa em silêncio.
  if (!allowed.includes(choice)) {
    throw new FieldValidationError(
      `O campo "${field.label}" não aceita a opção informada.`,
      field.label,
    );
  }

  return choice;
}

function asChoiceList(value: unknown, field: FieldDefinition): string[] {
  const values = Array.isArray(value) ? value : [value];

  if (values.length > MAX_MULTISELECT_ITEMS) {
    throw new FieldValidationError(
      `O campo "${field.label}" aceita no máximo ${MAX_MULTISELECT_ITEMS} itens.`,
      field.label,
    );
  }

  return values.map((item) => asChoice(item, field));
}

function asEmail(value: unknown, field: FieldDefinition): string {
  const text = asText(value, field, 320).toLocaleLowerCase("en-US");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw new FieldValidationError(
      `O campo "${field.label}" espera um e-mail válido.`,
      field.label,
    );
  }

  return text;
}

function asUrl(value: unknown, field: FieldDefinition): string {
  const text = asText(value, field, 2_000);

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new FieldValidationError(
      `O campo "${field.label}" espera um endereço começando com http:// ou https://.`,
      field.label,
    );
  }

  // Sem esta checagem um campo de URL viraria vetor de `javascript:` na
  // interface, que renderiza o valor como link.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FieldValidationError(
      `O campo "${field.label}" aceita apenas endereços http:// ou https://.`,
      field.label,
    );
  }

  return parsed.toString();
}

/**
 * Converte o valor cru para a forma que vai ao banco, recusando o que não
 * couber no tipo do campo. Anexos passam adiante intactos: quem resolve o
 * armazenamento deles é a camada que tem a transação em mãos.
 */
export function normalizeFieldValue(
  field: FieldDefinition,
  rawValue: unknown,
): unknown {
  if (isPendingAttachmentValue(rawValue)) {
    return rawValue;
  }

  if (isBlank(rawValue)) {
    if (field.isRequired) {
      throw new FieldValidationError(
        `O campo "${field.label}" é obrigatório.`,
        field.label,
      );
    }

    return null;
  }

  switch (field.type) {
    case "short_text":
    case "phone":
      return asText(rawValue, field, MAX_SHORT_TEXT);
    case "long_text":
      return asText(rawValue, field, MAX_LONG_TEXT);
    case "number":
    case "currency":
      return asNumber(rawValue, field);
    case "date":
    case "datetime":
      return asDate(rawValue, field);
    case "checkbox":
      return asBoolean(rawValue);
    case "select":
    case "radio":
      return asChoice(rawValue, field);
    case "multiselect":
      return asChoiceList(rawValue, field);
    case "email":
      return asEmail(rawValue, field);
    case "url":
      return asUrl(rawValue, field);
    case "user":
      return asText(rawValue, field, 64);
    case "attachment":
      // Chegou aqui sem ser um anexo pendente: é o valor já persistido
      // (`{ attachmentIds: [...] }`) sendo reenviado sem alteração.
      return rawValue;
    default:
      return asText(rawValue, field, MAX_SHORT_TEXT);
  }
}

/**
 * Valida um lote de valores contra os campos que realmente pertencem ao quadro.
 *
 * Ids desconhecidos são recusados em vez de ignorados: aceitar em silêncio foi
 * exatamente o que permitia gravar valores em campos de outro quadro passando
 * `cf_<uuid>` no formulário.
 */
export function normalizeFieldValues(
  fields: FieldDefinition[],
  rawValues: Record<string, unknown>,
): Record<string, unknown> {
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const normalized: Record<string, unknown> = {};

  for (const [fieldId, rawValue] of Object.entries(rawValues)) {
    const field = fieldById.get(fieldId);

    if (!field) {
      throw new FieldValidationError(
        "Um dos campos enviados não pertence a este quadro.",
        fieldId,
      );
    }

    normalized[fieldId] = normalizeFieldValue(field, rawValue);
  }

  return normalized;
}
