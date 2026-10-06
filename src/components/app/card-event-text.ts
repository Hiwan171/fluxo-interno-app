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

export function describeCardEvent(entry: CardHistoryDTO): string {
  const { metadata } = entry
  const actor = entry.actorName ?? "Alguém pelo formulário público"

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

    default:
      return `${actor} registrou uma alteração`
  }
}
