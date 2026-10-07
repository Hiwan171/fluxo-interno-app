import type { CardHistoryDTO } from "@/components/app/types"

/**
 * Transforma um evento gravado em frase legível.
 *
 * O `metadata` é jsonb — vem sem garantia de forma —, então cada leitura é
 * defensiva e cai num texto genérico quando o campo esperado não está lá. Um
 * evento antigo, gravado antes de o formato mudar, precisa continuar exibível.
 */

function text(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === "string" && value.trim() ? value : null
}

function describeImportedEvent(entry: CardHistoryDTO): string | null {
  const { metadata } = entry

  if (entry.type === "card.created") {
    if (metadata.source === "form") {
      return "Card aberto pelo formulário (importado do Pipefy)"
    }

    const creator = text(metadata, "importedCreator")
    const phaseName = text(metadata, "phaseName")
    const where = phaseName ? ` em "${phaseName}"` : ""

    return creator
      ? `${creator} criou o card${where} (importado do Pipefy)`
      : `Card criado${where} (importado do Pipefy)`
  }

  if (entry.type === "card.moved") {
    const from = text(metadata, "fromPhaseName")
    const to = text(metadata, "toPhaseName")

    if (from && to) return `Movido de "${from}" para "${to}" (histórico do Pipefy)`
    if (to) return `Movido para "${to}" (histórico do Pipefy)`
  }

  return null
}

export function describeCardEvent(entry: CardHistoryDTO): string {
  const { metadata } = entry
  const actor = entry.actorName ?? "Alguém pelo formulário público"

  // Eventos trazidos de outro sistema não têm autor: o Pipefy não informa quem
  // moveu cada card. Sem este desvio, todos apareceriam como "Alguém pelo
  // formulário público", que é uma afirmação falsa sobre o histórico.
  if (metadata.imported === true) {
    const imported = describeImportedEvent(entry)
    if (imported) return imported
  }

  switch (entry.type) {
    case "card.created": {
      const duplicatedFrom = metadata.duplicatedFromNumber
      if (typeof duplicatedFrom === "number") {
        return `${actor} duplicou o card #${duplicatedFrom}`
      }

      const formName = text(metadata, "formName")
      if (formName) {
        return `Card criado pelo formulário "${formName}"`
      }

      const phaseName = text(metadata, "phaseName")
      return phaseName
        ? `${actor} criou o card em "${phaseName}"`
        : `${actor} criou o card`
    }

    case "card.moved": {
      const from = text(metadata, "fromPhaseName")
      const to = text(metadata, "toPhaseName")

      if (from && to) return `${actor} moveu de "${from}" para "${to}"`
      if (to) return `${actor} moveu para "${to}"`
      return `${actor} moveu o card de fase`
    }

    case "card.completed": {
      const phaseName = text(metadata, "phaseName")
      return phaseName
        ? `Card concluído ao entrar em "${phaseName}"`
        : "Card concluído"
    }

    case "card.updated":
      return `${actor} editou o card`

    case "card.archived":
      return `${actor} arquivou o card`

    case "card.assigned": {
      const assignee = text(metadata, "assigneeName")
      return assignee
        ? `${actor} atribuiu para ${assignee}`
        : `${actor} definiu um responsável`
    }

    case "card.unassigned":
      return `${actor} removeu um responsável`

    case "card.contract_generated": {
      const fileName = text(metadata, "fileName")
      return fileName
        ? `${actor} gerou o contrato "${fileName}"`
        : `${actor} gerou um contrato`
    }

    default:
      return `${actor} registrou uma alteração`
  }
}
