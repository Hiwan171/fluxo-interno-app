/**
 * Decide se um campo aparece num card.
 *
 * Um campo sem fase vale para todas. Um campo de fase aparece enquanto o card
 * está nela e continua aparecendo depois que o card sai, desde que tenha valor:
 * o texto de uma conclusão, o valor de uma compra ou o fornecedor escolhido não
 * podem sumir quando o card avança para a fase seguinte. Campo de fase que o
 * card ainda não alcançou (e portanto está vazio) segue oculto.
 */
export function isFieldVisibleOnCard(
  field: { phaseId?: string | null },
  columnId: string | null | undefined,
  value: unknown,
): boolean {
  if (!field.phaseId || field.phaseId === columnId) return true

  return hasFieldValue(value)
}

export function hasFieldValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false
  if (Array.isArray(value)) return value.length > 0

  if (typeof value === "object") {
    const record = value as { files?: unknown; attachmentIds?: unknown }

    // Campo de anexo: o valor existe, mas pode ser uma lista vazia.
    if (Array.isArray(record.files)) return record.files.length > 0
    if (Array.isArray(record.attachmentIds)) return record.attachmentIds.length > 0
  }

  return true
}
