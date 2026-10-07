import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { BoardView } from "@/app/(app)/boards/[boardId]/board-view";
import { getAccentForPhaseColor } from "@/components/app/phase-colors";
import type {
  CustomFieldDTO,
  KanbanCardDTO,
  KanbanColumnDTO,
} from "@/components/app/types";
import { getCurrentSession } from "@/lib/auth";
import { buildKanbanCards } from "@/lib/card-dto";
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

  // O mesmo construtor da busca: quadro e resultado de busca devolvem o card
  // completo, no mesmo formato.
  const cardDtos = buildKanbanCards(
    snapshot.cards,
    snapshot,
    snapshot.board.expirationMinutes,
  );

  // Agrupar uma vez: o filtro dentro do map percorria todos os cards uma vez
  // por fase, custando O(fases x cards) a cada render.
  const cardsByPhase = new Map<string, KanbanCardDTO[]>();
  for (const card of cardDtos) {
    const bucket = cardsByPhase.get(card.columnId) ?? [];
    bucket.push(card);
    cardsByPhase.set(card.columnId, bucket);
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
    cards: cardsByPhase.get(phase.id) ?? [],
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
