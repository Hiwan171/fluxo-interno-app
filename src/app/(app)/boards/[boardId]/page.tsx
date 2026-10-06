import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { BoardView } from "@/app/(app)/boards/[boardId]/board-view";
import { getAccentForPhaseColor } from "@/components/app/phase-colors";
import type {
  CustomFieldDTO,
  KanbanAssigneeDTO,
  KanbanCardDTO,
  KanbanColumnDTO,
} from "@/components/app/types";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  getWorkspaceSummary,
  listAssignableMembersForCurrentUser,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  try {
    snapshot = await getBoardSnapshot(boardId);
  } catch (error) {
    if (
      error instanceof ResourceNotFoundError ||
      error instanceof AuthorizationError
    ) {
      notFound();
    }
    throw error;
  }

  const [session, workspace, assignableMembers] = await Promise.all([
    getCurrentSession(),
    getWorkspaceSummary(snapshot.board.workspaceId),
    listAssignableMembersForCurrentUser(boardId),
  ]);

  if (!session) {
    notFound();
  }

  const assigneesByCard = new Map<string, KanbanAssigneeDTO[]>();
  for (const assignee of snapshot.assignees) {
    const list = assigneesByCard.get(assignee.cardId) ?? [];
    list.push({
      id: assignee.userId,
      name: assignee.name,
      avatarUrl: assignee.avatarUrl,
    });
    assigneesByCard.set(assignee.cardId, list);
  }

  const attachmentsById = new Map(
    snapshot.attachments.map((attachment) => [attachment.id, attachment]),
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
  for (const row of snapshot.fieldValues) {
    const values = fieldValuesByCard.get(row.cardId) ?? {};
    values[row.customFieldId] = resolveFieldValue(row.value);
    fieldValuesByCard.set(row.cardId, values);
  }

  const emailCountByCard = new Map(
    snapshot.emailCounts
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

  const customFields: CustomFieldDTO[] = snapshot.customFields.map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    isRequired: field.isRequired,
    phaseId: field.phaseId,
    options: Array.isArray((field.config as { options?: unknown })?.options)
      ? ((field.config as { options: Array<{ label: string; value: string }> })
          .options)
      : undefined,
  }));

  const expirationMinutes = snapshot.board.expirationMinutes;

  // Só o prazo é calculado aqui — dado puro, derivado da entrada na fase.
  // Comparar com a hora atual é responsabilidade do cliente, que reavalia
  // enquanto a página estiver aberta.
  function phaseDeadlineFor(phaseEnteredAt: Date): string | null {
    if (expirationMinutes == null) return null;

    return new Date(
      phaseEnteredAt.getTime() + expirationMinutes * 60_000,
    ).toISOString();
  }

  // Agrupar uma vez: o filtro dentro do map percorria todos os cards uma vez
  // por fase, custando O(fases x cards) a cada render.
  const cardsByPhase = new Map<string, typeof snapshot.cards>();
  for (const card of snapshot.cards) {
    const bucket = cardsByPhase.get(card.phaseId) ?? [];
    bucket.push(card);
    cardsByPhase.set(card.phaseId, bucket);
  }

  const totalByPhase = new Map(
    snapshot.phaseTotals.map((row) => [row.phaseId, row.total]),
  );

  const columns: KanbanColumnDTO[] = snapshot.phases.map((phase, index) => ({
    id: phase.id,
    title: phase.name,
    accent: getAccentForPhaseColor(phase.color, index),
    limit: phase.cardLimit,
    isInitial: phase.isInitial,
    totalCards: totalByPhase.get(phase.id) ?? 0,
    cards: (cardsByPhase.get(phase.id) ?? []).map<KanbanCardDTO>((card) => ({
        id: card.id,
        columnId: card.phaseId,
        title: card.title,
        reference: `#${card.number}`,
        description: card.description,
        priority: card.priority,
        dueDate: card.dueAt ? card.dueAt.toISOString() : null,
        assignees: assigneesByCard.get(card.id) ?? [],
        customFieldValues: fieldValuesByCard.get(card.id) ?? {},
        emailCount: emailCountByCard.get(card.id) ?? 0,
        attachmentCount: countAttachments(fieldValuesByCard.get(card.id) ?? {}),
        phaseDeadline: phaseDeadlineFor(card.phaseEnteredAt),
      })),
  }));

  return (
    <BoardView
      boardId={snapshot.board.id}
      boardName={snapshot.board.name}
      boardIcon={snapshot.board.icon}
      createCardButtonLabel={snapshot.board.createCardButtonLabel}
      workspaceName={workspace.name}
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl,
        role: session.user.systemRole,
      }}
      signOutAction={signOutAction}
      columns={columns}
      customFields={customFields}
      kanbanVisibleFieldIds={snapshot.board.kanbanVisibleFieldIds}
      assignableMembers={assignableMembers}
    />
  );
}
