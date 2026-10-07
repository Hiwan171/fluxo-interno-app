import type {
  KanbanAssigneeDTO,
  KanbanCardDTO,
} from "@/components/app/types";

/**
 * Monta o card completo que o quadro e o painel de detalhes consomem.
 *
 * Existe um único construtor porque o quadro e a busca precisam devolver o mesmo
 * formato. Quando a busca montava o card por conta própria, ele saía sem valores
 * de campo, sem anexos e sem contagem de e-mails: o painel aberto a partir de um
 * resultado mostrava campos vazios, e salvar poderia gravar vazio por cima do
 * valor real.
 */

export type CardRow = {
  id: string;
  phaseId: string;
  number: number;
  title: string;
  description: string | null;
  priority: KanbanCardDTO["priority"];
  dueAt: Date | null;
  phaseEnteredAt: Date;
};

export type CardExtras = {
  assignees: Array<{
    cardId: string;
    userId: string;
    name: string;
    avatarUrl: string | null;
  }>;
  fieldValues: Array<{ cardId: string; customFieldId: string; value: unknown }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  emailCounts: Array<{ cardId: string | null; count: number }>;
};

export function buildKanbanCards(
  rows: CardRow[],
  extras: CardExtras,
  expirationMinutes: number | null,
): KanbanCardDTO[] {
  const assigneesByCard = new Map<string, KanbanAssigneeDTO[]>();
  for (const assignee of extras.assignees) {
    const list = assigneesByCard.get(assignee.cardId) ?? [];
    list.push({
      id: assignee.userId,
      name: assignee.name,
      avatarUrl: assignee.avatarUrl,
    });
    assigneesByCard.set(assignee.cardId, list);
  }

  const attachmentsById = new Map(
    extras.attachments.map((attachment) => [attachment.id, attachment]),
  );

  function resolveFieldValue(value: unknown) {
    const attachmentIds = (value as { attachmentIds?: unknown } | null)
      ?.attachmentIds;
    if (!Array.isArray(attachmentIds)) return value;

    return {
      attachmentIds,
      files: attachmentIds
        .map((id) => attachmentsById.get(id))
        .filter((file): file is NonNullable<typeof file> => Boolean(file)),
    };
  }

  const fieldValuesByCard = new Map<string, Record<string, unknown>>();
  for (const row of extras.fieldValues) {
    const values = fieldValuesByCard.get(row.cardId) ?? {};
    values[row.customFieldId] = resolveFieldValue(row.value);
    fieldValuesByCard.set(row.cardId, values);
  }

  const emailCountByCard = new Map(
    extras.emailCounts
      .filter((row): row is { cardId: string; count: number } => row.cardId !== null)
      .map((row) => [row.cardId, row.count]),
  );

  function countAttachments(values: Record<string, unknown>) {
    let count = 0;
    for (const value of Object.values(values)) {
      const files = (value as { files?: unknown } | null)?.files;
      if (Array.isArray(files)) count += files.length;
    }
    return count;
  }

  // Só o prazo é calculado aqui — dado puro, derivado da entrada na fase.
  // Comparar com a hora atual é responsabilidade do cliente, que reavalia
  // enquanto a página estiver aberta.
  function phaseDeadlineFor(phaseEnteredAt: Date): string | null {
    if (expirationMinutes == null) return null;

    return new Date(
      phaseEnteredAt.getTime() + expirationMinutes * 60_000,
    ).toISOString();
  }

  return rows.map<KanbanCardDTO>((card) => {
    const values = fieldValuesByCard.get(card.id) ?? {};

    return {
      id: card.id,
      columnId: card.phaseId,
      title: card.title,
      reference: `#${card.number}`,
      description: card.description,
      priority: card.priority,
      dueDate: card.dueAt ? card.dueAt.toISOString() : null,
      assignees: assigneesByCard.get(card.id) ?? [],
      customFieldValues: values,
      emailCount: emailCountByCard.get(card.id) ?? 0,
      attachmentCount: countAttachments(values),
      phaseDeadline: phaseDeadlineFor(card.phaseEnteredAt),
    };
  });
}
