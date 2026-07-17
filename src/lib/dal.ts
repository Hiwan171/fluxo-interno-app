import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import {
  boardMembers,
  boards,
  cardAssignees,
  cardFieldValues,
  cards,
  comments,
  customFields,
  emailMessages,
  formFields,
  intakeForms,
  phases,
  users,
  workspaceMembers,
  workspaces,
  type BoardMemberRole,
  type WorkspaceRole,
} from "@/db/schema";
import { getCurrentSession, hashPassword, type AuthSession } from "@/lib/auth";
import { sendWorkflowEmail } from "@/lib/email";
import {
  createBoardSchema,
  createCardSchema,
  createCommentSchema,
  createCustomFieldSchema,
  createFormFieldSchema,
  createIntakeFormSchema,
  createPhaseSchema,
  emailSchema,
  moveCardSchema,
  updateCardSchema,
  updateCustomFieldSchema,
  updateFormFieldSchema,
  updateIntakeFormSchema,
  updatePhaseSchema,
  uuidSchema,
  type CreateBoardInput,
  type CreateCardInput,
  type CreateCommentInput,
  type CreateCustomFieldInput,
  type CreateFormFieldInput,
  type CreateIntakeFormInput,
  type CreatePhaseInput,
  type UpdateFormFieldInput,
  type UpdateCardInput,
  type UpdateCustomFieldInput,
  type UpdateIntakeFormInput,
  type UpdatePhaseInput,
} from "@/lib/validation";

const WORKSPACE_ROLE_WEIGHT: Record<WorkspaceRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export type BoardAccess = "view" | "edit" | "manage";

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHENTICATED";

  constructor(message = "Faça login para continuar.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";

  constructor(message = "Você não tem permissão para esta operação.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ResourceNotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Recurso não encontrado.") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

export class ConflictError extends Error {
  readonly status = 409;
  readonly code = "CONFLICT";

  constructor(message = "Operação não pode ser concluída no estado atual.") {
    super(message);
    this.name = "ConflictError";
  }
}

export async function getOptionalSession(): Promise<AuthSession | null> {
  return getCurrentSession();
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getCurrentSession();

  if (!session) {
    throw new AuthenticationError();
  }

  return session;
}

export async function getCurrentUser(): Promise<AuthSession["user"] | null> {
  return (await getOptionalSession())?.user ?? null;
}

export async function requireSystemAdmin(): Promise<AuthSession> {
  const session = await requireSession();

  if (session.user.systemRole !== "admin") {
    throw new AuthorizationError("Apenas administradores do sistema podem continuar.");
  }

  return session;
}

export type WorkspaceAccessResult = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  role: WorkspaceRole;
  isSystemAdmin: boolean;
  session: AuthSession;
};

export async function requireWorkspaceRole(
  workspaceId: string,
  minimumRole: WorkspaceRole = "viewer",
): Promise<WorkspaceAccessResult> {
  const session = await requireSession();
  const [workspace] = await getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new ResourceNotFoundError("Workspace não encontrado.");
  }

  if (session.user.systemRole === "admin") {
    return { workspace, role: "owner", isSystemAdmin: true, session };
  }

  const [membership] = await getDb()
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.userId),
      ),
    )
    .limit(1);

  if (
    !membership ||
    WORKSPACE_ROLE_WEIGHT[membership.role] < WORKSPACE_ROLE_WEIGHT[minimumRole]
  ) {
    throw new AuthorizationError();
  }

  return {
    workspace,
    role: membership.role,
    isSystemAdmin: false,
    session,
  };
}

function boardRoleAllows(
  role: BoardMemberRole | null,
  access: BoardAccess,
): boolean {
  if (!role) return false;
  if (access === "view") return true;
  if (access === "edit") return role === "editor" || role === "manager";
  return role === "manager";
}

export type BoardAccessResult = {
  board: {
    id: string;
    workspaceId: string;
    name: string;
    slug: string;
    description: string | null;
    color: string;
    icon: string | null;
    visibility: "workspace" | "private";
    isArchived: boolean;
  };
  workspaceRole: WorkspaceRole;
  boardRole: BoardMemberRole | null;
  access: BoardAccess;
  session: AuthSession;
};

export async function requireBoardAccess(
  boardId: string,
  access: BoardAccess = "view",
): Promise<BoardAccessResult> {
  const session = await requireSession();
  const [board] = await getDb()
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      name: boards.name,
      slug: boards.slug,
      description: boards.description,
      color: boards.color,
      icon: boards.icon,
      visibility: boards.visibility,
      isArchived: boards.isArchived,
    })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  if (!board) {
    throw new ResourceNotFoundError("Quadro não encontrado.");
  }

  if (session.user.systemRole === "admin") {
    return {
      board,
      workspaceRole: "owner",
      boardRole: "manager",
      access,
      session,
    };
  }

  const [[workspaceMembership], [boardMembership]] = await Promise.all([
    getDb()
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, board.workspaceId),
          eq(workspaceMembers.userId, session.userId),
        ),
      )
      .limit(1),
    getDb()
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(
        and(
          eq(boardMembers.boardId, board.id),
          eq(boardMembers.userId, session.userId),
        ),
      )
      .limit(1),
  ]);

  if (!workspaceMembership) {
    throw new AuthorizationError();
  }

  const workspaceRole = workspaceMembership.role;
  const boardRole = boardMembership?.role ?? null;
  const isWorkspaceManager =
    workspaceRole === "owner" || workspaceRole === "admin";
  const canViewFromWorkspace =
    board.visibility === "workspace" &&
    WORKSPACE_ROLE_WEIGHT[workspaceRole] >= WORKSPACE_ROLE_WEIGHT.viewer;
  const canEditFromWorkspace =
    board.visibility === "workspace" &&
    WORKSPACE_ROLE_WEIGHT[workspaceRole] >= WORKSPACE_ROLE_WEIGHT.member;

  const allowed =
    isWorkspaceManager ||
    (access === "view" &&
      (canViewFromWorkspace || boardRoleAllows(boardRole, access))) ||
    (access === "edit" &&
      (canEditFromWorkspace || boardRoleAllows(boardRole, access))) ||
    (access === "manage" && boardRoleAllows(boardRole, access));

  if (!allowed) {
    throw new AuthorizationError();
  }

  return { board, workspaceRole, boardRole, access, session };
}

export async function listWorkspacesForCurrentUser() {
  const session = await requireSession();

  if (session.user.systemRole === "admin") {
    return getDb()
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        timezone: workspaces.timezone,
        role: workspaceMembers.role,
      })
      .from(workspaces)
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, session.userId),
        ),
      )
      .orderBy(asc(workspaces.name));
  }

  return getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, session.userId))
    .orderBy(asc(workspaces.name));
}

export async function listWorkspaceBoards(workspaceId: string) {
  const access = await requireWorkspaceRole(workspaceId, "viewer");

  const boardRows =
    access.isSystemAdmin || access.role === "owner" || access.role === "admin"
      ? await getDb()
          .select({
            id: boards.id,
            name: boards.name,
            slug: boards.slug,
            description: boards.description,
            color: boards.color,
            icon: boards.icon,
            visibility: boards.visibility,
            position: boards.position,
            isArchived: boards.isArchived,
          })
          .from(boards)
          .where(eq(boards.workspaceId, workspaceId))
          .orderBy(asc(boards.position), asc(boards.name))
      : await getDb()
          .selectDistinct({
            id: boards.id,
            name: boards.name,
            slug: boards.slug,
            description: boards.description,
            color: boards.color,
            icon: boards.icon,
            visibility: boards.visibility,
            position: boards.position,
            isArchived: boards.isArchived,
          })
          .from(boards)
          .leftJoin(
            boardMembers,
            and(
              eq(boardMembers.boardId, boards.id),
              eq(boardMembers.userId, access.session.userId),
            ),
          )
          .where(
            and(
              eq(boards.workspaceId, workspaceId),
              or(
                eq(boards.visibility, "workspace"),
                eq(boardMembers.userId, access.session.userId),
              ),
            ),
          )
          .orderBy(asc(boards.position), asc(boards.name));

  if (boardRows.length === 0) {
    return boardRows.map((board) => ({ ...board, cardCount: 0 }));
  }

  const counts = await getDb()
    .select({
      boardId: cards.boardId,
      value: sql<number>`count(*)::int`,
    })
    .from(cards)
    .where(
      and(
        inArray(
          cards.boardId,
          boardRows.map((board) => board.id),
        ),
        eq(cards.status, "active"),
      ),
    )
    .groupBy(cards.boardId);

  const countByBoard = new Map(counts.map((row) => [row.boardId, row.value]));

  return boardRows.map((board) => ({
    ...board,
    cardCount: countByBoard.get(board.id) ?? 0,
  }));
}

export async function createBoardForCurrentUser(input: CreateBoardInput) {
  const parsed = createBoardSchema.parse(input);
  const { workspace, session } = await requireWorkspaceRole(
    parsed.workspaceId,
    "admin",
  );

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(boards)
      .where(eq(boards.workspaceId, workspace.id));

    const [createdBoard] = await tx
      .insert(boards)
      .values({
        workspaceId: workspace.id,
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description ?? null,
        color: parsed.color,
        icon: parsed.icon ?? null,
        visibility: parsed.visibility,
        position: countRow.value,
        createdBy: session.userId,
      })
      .returning();

    await tx.insert(phases).values([
      { boardId: createdBoard.id, name: "Novo", position: 0, isInitial: true },
      { boardId: createdBoard.id, name: "Concluído", position: 1, isFinal: true },
    ]);

    return createdBoard;
  });
}

export async function getBoardSnapshot(boardId: string) {
  const { board } = await requireBoardAccess(boardId, "view");

  const [boardPhases, boardCards, boardFields, boardForms] = await Promise.all([
    getDb()
      .select()
      .from(phases)
      .where(eq(phases.boardId, boardId))
      .orderBy(asc(phases.position)),
    getDb()
      .select()
      .from(cards)
      .where(and(eq(cards.boardId, boardId), eq(cards.status, "active")))
      .orderBy(asc(cards.phaseId), asc(cards.position), asc(cards.number)),
    getDb()
      .select()
      .from(customFields)
      .where(
        and(
          eq(customFields.boardId, boardId),
          eq(customFields.isArchived, false),
        ),
      )
      .orderBy(asc(customFields.position)),
    getDb()
      .select({
        id: intakeForms.id,
        name: intakeForms.name,
        publicKey: intakeForms.publicKey,
        status: intakeForms.status,
        targetPhaseId: intakeForms.targetPhaseId,
      })
      .from(intakeForms)
      .where(eq(intakeForms.boardId, boardId))
      .orderBy(asc(intakeForms.name)),
  ]);

  const cardIds = boardCards.map((card) => card.id);
  const [assignees, fieldValues] = cardIds.length
    ? await Promise.all([
        getDb()
          .select({
            cardId: cardAssignees.cardId,
            userId: users.id,
            name: users.name,
            avatarUrl: users.avatarUrl,
          })
          .from(cardAssignees)
          .innerJoin(users, eq(users.id, cardAssignees.userId))
          .where(inArray(cardAssignees.cardId, cardIds)),
        getDb()
          .select({
            cardId: cardFieldValues.cardId,
            customFieldId: cardFieldValues.customFieldId,
            value: cardFieldValues.value,
          })
          .from(cardFieldValues)
          .where(inArray(cardFieldValues.cardId, cardIds)),
      ])
    : [[], []];

  return {
    board,
    phases: boardPhases,
    cards: boardCards,
    customFields: boardFields,
    forms: boardForms,
    assignees,
    fieldValues,
  };
}

export async function getWorkspaceSummary(workspaceId: string) {
  await requireWorkspaceRole(workspaceId, "viewer");

  const [workspace] = await getDb()
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new ResourceNotFoundError("Workspace não encontrado.");
  }

  return workspace;
}

export async function getCardForCurrentUser(cardId: string) {
  const [card] = await getDb()
    .select()
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  await requireBoardAccess(card.boardId, "view");
  return card;
}

export async function moveCardForCurrentUser(input: {
  cardId: string;
  destinationPhaseId: string;
  position: number;
}) {
  const { cardId, destinationPhaseId, position } = moveCardSchema.parse(input);

  const [card] = await getDb()
    .select({ id: cards.id, boardId: cards.boardId, phaseId: cards.phaseId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  await requireBoardAccess(card.boardId, "edit");

  const [destinationPhase] = await getDb()
    .select({ id: phases.id, boardId: phases.boardId })
    .from(phases)
    .where(eq(phases.id, destinationPhaseId))
    .limit(1);

  if (!destinationPhase || destinationPhase.boardId !== card.boardId) {
    throw new ResourceNotFoundError("Etapa não encontrada neste quadro.");
  }

  await getDb().transaction(async (tx) => {
    const affectedPhaseIds = Array.from(
      new Set([card.phaseId, destinationPhaseId]),
    );

    const rows = await tx
      .select({
        id: cards.id,
        phaseId: cards.phaseId,
        position: cards.position,
      })
      .from(cards)
      .where(
        and(
          eq(cards.boardId, card.boardId),
          eq(cards.status, "active"),
          inArray(cards.phaseId, affectedPhaseIds),
        ),
      )
      .orderBy(asc(cards.phaseId), asc(cards.position));

    const byPhase = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byPhase.get(row.phaseId) ?? [];
      list.push(row);
      byPhase.set(row.phaseId, list);
    }

    const sourceList = (byPhase.get(card.phaseId) ?? []).filter(
      (row) => row.id !== cardId,
    );

    if (card.phaseId === destinationPhaseId) {
      const clamped = Math.max(0, Math.min(position, sourceList.length));
      sourceList.splice(clamped, 0, {
        id: cardId,
        phaseId: destinationPhaseId,
        position: clamped,
      });

      for (const [index, row] of sourceList.entries()) {
        await tx
          .update(cards)
          .set({ position: index, phaseId: destinationPhaseId })
          .where(eq(cards.id, row.id));
      }
      return;
    }

    const destinationList = byPhase.get(destinationPhaseId) ?? [];
    const clamped = Math.max(0, Math.min(position, destinationList.length));
    destinationList.splice(clamped, 0, {
      id: cardId,
      phaseId: destinationPhaseId,
      position: clamped,
    });

    for (const [index, row] of sourceList.entries()) {
      await tx.update(cards).set({ position: index }).where(eq(cards.id, row.id));
    }
    for (const [index, row] of destinationList.entries()) {
      await tx
        .update(cards)
        .set({ position: index, phaseId: destinationPhaseId })
        .where(eq(cards.id, row.id));
    }
  });
}

export async function createCardForCurrentUser(input: CreateCardInput) {
  const parsed = createCardSchema.parse(input);
  const { board, session } = await requireBoardAccess(
    parsed.boardId,
    "edit",
  );

  const [phase] = await getDb()
    .select({ id: phases.id, boardId: phases.boardId })
    .from(phases)
    .where(eq(phases.id, parsed.phaseId))
    .limit(1);

  if (!phase || phase.boardId !== board.id) {
    throw new ResourceNotFoundError("Etapa não encontrada neste quadro.");
  }

  return getDb().transaction(async (tx) => {
    const [numberRow] = await tx
      .select({ value: sql<number>`coalesce(max(${cards.number}), 0) + 1` })
      .from(cards)
      .where(eq(cards.boardId, board.id));

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(cards)
      .where(
        and(eq(cards.phaseId, parsed.phaseId), eq(cards.status, "active")),
      );

    const [created] = await tx
      .insert(cards)
      .values({
        workspaceId: board.workspaceId,
        boardId: board.id,
        phaseId: parsed.phaseId,
        number: numberRow.value,
        title: parsed.title,
        description: parsed.description ?? null,
        priority: parsed.priority,
        position: countRow.value,
        requesterName: parsed.requesterName ?? null,
        requesterEmail: parsed.requesterEmail ?? null,
        dueAt: parsed.dueAt ?? null,
        source: parsed.source,
        sourceFormId: parsed.sourceFormId ?? null,
        createdBy: session.userId,
        updatedBy: session.userId,
      })
      .returning();

    await upsertCardFieldValues(tx, created.id, parsed.fieldValues);

    return created;
  });
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function upsertCardFieldValues(
  tx: Tx,
  cardId: string,
  fieldValues: Record<string, unknown>,
) {
  const entries = Object.entries(fieldValues);
  if (entries.length === 0) return;

  for (const [customFieldId, value] of entries) {
    await tx
      .insert(cardFieldValues)
      .values({ cardId, customFieldId, value })
      .onConflictDoUpdate({
        target: [cardFieldValues.cardId, cardFieldValues.customFieldId],
        set: { value },
      });
  }
}

export async function createPhaseForCurrentUser(input: CreatePhaseInput) {
  const parsed = createPhaseSchema.parse(input);
  const { board } = await requireBoardAccess(parsed.boardId, "manage");

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(phases)
      .where(eq(phases.boardId, board.id));

    const [created] = await tx
      .insert(phases)
      .values({
        boardId: board.id,
        name: parsed.name,
        description: parsed.description ?? null,
        color: parsed.color ?? null,
        position: countRow.value,
        isInitial: parsed.isInitial,
        isFinal: parsed.isFinal,
        cardLimit: parsed.cardLimit ?? null,
      })
      .returning();

    return created;
  });
}

export async function updatePhaseForCurrentUser(
  phaseId: string,
  input: UpdatePhaseInput,
) {
  const parsed = updatePhaseSchema.parse(input);

  const [phase] = await getDb()
    .select({ id: phases.id, boardId: phases.boardId })
    .from(phases)
    .where(eq(phases.id, phaseId))
    .limit(1);

  if (!phase) {
    throw new ResourceNotFoundError("Etapa não encontrada.");
  }

  await requireBoardAccess(phase.boardId, "manage");

  const [updated] = await getDb()
    .update(phases)
    .set({
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined
        ? { description: parsed.description }
        : {}),
      ...(parsed.color !== undefined ? { color: parsed.color } : {}),
      ...(parsed.isInitial !== undefined ? { isInitial: parsed.isInitial } : {}),
      ...(parsed.isFinal !== undefined ? { isFinal: parsed.isFinal } : {}),
      ...(parsed.cardLimit !== undefined ? { cardLimit: parsed.cardLimit } : {}),
    })
    .where(eq(phases.id, phaseId))
    .returning();

  return updated;
}

export async function deletePhaseForCurrentUser(phaseId: string) {
  const [phase] = await getDb()
    .select({ id: phases.id, boardId: phases.boardId })
    .from(phases)
    .where(eq(phases.id, phaseId))
    .limit(1);

  if (!phase) {
    throw new ResourceNotFoundError("Etapa não encontrada.");
  }

  await requireBoardAccess(phase.boardId, "manage");

  const [cardInPhase] = await getDb()
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.phaseId, phaseId))
    .limit(1);

  if (cardInPhase) {
    throw new ConflictError(
      "Mova ou arquive os cards desta etapa antes de excluí-la.",
    );
  }

  await getDb().delete(phases).where(eq(phases.id, phaseId));
}

export async function movePhaseForCurrentUser(
  phaseId: string,
  direction: "left" | "right",
) {
  const [phase] = await getDb()
    .select({ id: phases.id, boardId: phases.boardId })
    .from(phases)
    .where(eq(phases.id, phaseId))
    .limit(1);

  if (!phase) {
    throw new ResourceNotFoundError("Etapa não encontrada.");
  }

  await requireBoardAccess(phase.boardId, "manage");

  const boardPhases = await getDb()
    .select({ id: phases.id, position: phases.position })
    .from(phases)
    .where(eq(phases.boardId, phase.boardId))
    .orderBy(asc(phases.position));

  const index = boardPhases.findIndex((row) => row.id === phaseId);
  const targetIndex = direction === "left" ? index - 1 : index + 1;

  if (index === -1 || targetIndex < 0 || targetIndex >= boardPhases.length) {
    return;
  }

  const current = boardPhases[index];
  const target = boardPhases[targetIndex];

  await getDb().transaction(async (tx) => {
    await tx
      .update(phases)
      .set({ position: target.position })
      .where(eq(phases.id, current.id));
    await tx
      .update(phases)
      .set({ position: current.position })
      .where(eq(phases.id, target.id));
  });
}

export async function updateCardForCurrentUser(
  cardId: string,
  input: UpdateCardInput,
) {
  const parsed = updateCardSchema.parse(input);

  const [card] = await getDb()
    .select({ id: cards.id, boardId: cards.boardId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  const { session } = await requireBoardAccess(card.boardId, "edit");

  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(cards)
      .set({
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        ...(parsed.description !== undefined
          ? { description: parsed.description }
          : {}),
        ...(parsed.priority !== undefined
          ? { priority: parsed.priority }
          : {}),
        ...(parsed.requesterName !== undefined
          ? { requesterName: parsed.requesterName }
          : {}),
        ...(parsed.requesterEmail !== undefined
          ? { requesterEmail: parsed.requesterEmail }
          : {}),
        ...(parsed.dueAt !== undefined ? { dueAt: parsed.dueAt } : {}),
        updatedBy: session.userId,
      })
      .where(eq(cards.id, cardId))
      .returning();

    if (parsed.fieldValues) {
      await upsertCardFieldValues(tx, cardId, parsed.fieldValues);
    }

    return updated;
  });
}

export async function duplicateCardForCurrentUser(cardId: string) {
  const [original] = await getDb()
    .select()
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!original) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  const { session } = await requireBoardAccess(original.boardId, "edit");

  return getDb().transaction(async (tx) => {
    const [numberRow] = await tx
      .select({ value: sql<number>`coalesce(max(${cards.number}), 0) + 1` })
      .from(cards)
      .where(eq(cards.boardId, original.boardId));

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(cards)
      .where(
        and(eq(cards.phaseId, original.phaseId), eq(cards.status, "active")),
      );

    const [created] = await tx
      .insert(cards)
      .values({
        workspaceId: original.workspaceId,
        boardId: original.boardId,
        phaseId: original.phaseId,
        number: numberRow.value,
        title: `${original.title} (cópia)`,
        description: original.description,
        priority: original.priority,
        position: countRow.value,
        requesterName: original.requesterName,
        requesterEmail: original.requesterEmail,
        dueAt: original.dueAt,
        source: "manual",
        createdBy: session.userId,
        updatedBy: session.userId,
      })
      .returning();

    return created;
  });
}

export async function archiveCardForCurrentUser(cardId: string) {
  const [card] = await getDb()
    .select({ id: cards.id, boardId: cards.boardId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  await requireBoardAccess(card.boardId, "edit");

  await getDb()
    .update(cards)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(cards.id, cardId));
}

async function requireCardBoardAccess(cardId: string, access: BoardAccess) {
  const [card] = await getDb()
    .select({ id: cards.id, boardId: cards.boardId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  const boardAccess = await requireBoardAccess(card.boardId, access);
  return { card, ...boardAccess };
}

export async function getCardActivityForCurrentUser(cardId: string) {
  await requireCardBoardAccess(cardId, "view");

  const [cardComments, cardEmails] = await Promise.all([
    getDb()
      .select({
        id: comments.id,
        body: comments.body,
        isInternal: comments.isInternal,
        createdAt: comments.createdAt,
        authorId: comments.authorId,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.cardId, cardId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt)),
    getDb()
      .select({
        id: emailMessages.id,
        status: emailMessages.status,
        toAddresses: emailMessages.toAddresses,
        ccAddresses: emailMessages.ccAddresses,
        subject: emailMessages.subject,
        textBody: emailMessages.textBody,
        errorMessage: emailMessages.errorMessage,
        sentAt: emailMessages.sentAt,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(eq(emailMessages.cardId, cardId))
      .orderBy(desc(emailMessages.createdAt)),
  ]);

  return { comments: cardComments, emails: cardEmails };
}

export async function createCommentForCurrentUser(input: CreateCommentInput) {
  const parsed = createCommentSchema.parse(input);
  const { session } = await requireCardBoardAccess(parsed.cardId, "view");

  const [created] = await getDb()
    .insert(comments)
    .values({
      cardId: parsed.cardId,
      authorId: session.userId,
      body: parsed.body,
      isInternal: parsed.isInternal,
    })
    .returning();

  return created;
}

export async function deleteCommentForCurrentUser(commentId: string) {
  const [comment] = await getDb()
    .select({
      id: comments.id,
      cardId: comments.cardId,
      authorId: comments.authorId,
    })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) {
    throw new ResourceNotFoundError("Comentário não encontrado.");
  }

  const { session, boardRole, workspaceRole } = await requireCardBoardAccess(
    comment.cardId,
    "view",
  );

  const isAuthor = comment.authorId === session.userId;
  const isManager =
    session.user.systemRole === "admin" ||
    workspaceRole === "owner" ||
    workspaceRole === "admin" ||
    boardRole === "manager";

  if (!isAuthor && !isManager) {
    throw new AuthorizationError(
      "Você só pode excluir os seus próprios comentários.",
    );
  }

  await getDb()
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, commentId));
}

export async function listCustomFieldsForBoard(boardId: string) {
  await requireBoardAccess(boardId, "view");

  return getDb()
    .select()
    .from(customFields)
    .where(and(eq(customFields.boardId, boardId), eq(customFields.isArchived, false)))
    .orderBy(asc(customFields.position));
}

export async function createCustomFieldForCurrentUser(
  input: CreateCustomFieldInput,
) {
  const parsed = createCustomFieldSchema.parse(input);
  const { board } = await requireBoardAccess(parsed.boardId, "manage");

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(customFields)
      .where(eq(customFields.boardId, board.id));

    const [created] = await tx
      .insert(customFields)
      .values({
        boardId: board.id,
        key: parsed.key,
        label: parsed.label,
        description: parsed.description ?? null,
        type: parsed.type,
        config: parsed.config,
        isRequired: parsed.isRequired,
        position: countRow.value,
      })
      .returning();

    return created;
  });
}

export async function updateCustomFieldForCurrentUser(
  fieldId: string,
  input: UpdateCustomFieldInput,
) {
  const parsed = updateCustomFieldSchema.parse(input);

  const [field] = await getDb()
    .select({ id: customFields.id, boardId: customFields.boardId })
    .from(customFields)
    .where(eq(customFields.id, fieldId))
    .limit(1);

  if (!field) {
    throw new ResourceNotFoundError("Campo não encontrado.");
  }

  await requireBoardAccess(field.boardId, "manage");

  const [updated] = await getDb()
    .update(customFields)
    .set({
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.description !== undefined
        ? { description: parsed.description }
        : {}),
      ...(parsed.config !== undefined ? { config: parsed.config } : {}),
      ...(parsed.isRequired !== undefined
        ? { isRequired: parsed.isRequired }
        : {}),
    })
    .where(eq(customFields.id, fieldId))
    .returning();

  return updated;
}

export async function archiveCustomFieldForCurrentUser(fieldId: string) {
  const [field] = await getDb()
    .select({ id: customFields.id, boardId: customFields.boardId })
    .from(customFields)
    .where(eq(customFields.id, fieldId))
    .limit(1);

  if (!field) {
    throw new ResourceNotFoundError("Campo não encontrado.");
  }

  await requireBoardAccess(field.boardId, "manage");

  await getDb()
    .update(customFields)
    .set({ isArchived: true })
    .where(eq(customFields.id, fieldId));
}

export async function listWorkspaceMembersForCurrentUser(workspaceId: string) {
  await requireWorkspaceRole(workspaceId, "admin");

  return getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.name));
}

const addWorkspaceMemberInputSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(160),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export async function addWorkspaceMemberForCurrentUser(
  workspaceId: string,
  input: { email: string; name: string; role: WorkspaceRole },
) {
  const parsed = addWorkspaceMemberInputSchema.parse(input);
  const { workspace } = await requireWorkspaceRole(workspaceId, "admin");
  const email = parsed.email;

  let [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  let temporaryPassword: string | null = null;

  if (!user) {
    temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(temporaryPassword);
    [user] = await getDb()
      .insert(users)
      .values({
        email,
        name: parsed.name,
        passwordHash,
        systemRole: "user",
      })
      .returning();
  }

  const [existingMembership] = await getDb()
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
      ),
    )
    .limit(1);

  if (existingMembership) {
    throw new ConflictError("Este usuário já é membro deste espaço de trabalho.");
  }

  await getDb()
    .insert(workspaceMembers)
    .values({ workspaceId, userId: user.id, role: parsed.role });

  if (temporaryPassword) {
    await sendWorkflowEmail({
      to: [user.email],
      subjectTemplate: "Você foi adicionado ao espaço {{workspace}}",
      bodyTemplate:
        "Olá {{name}},\n\nVocê agora tem acesso ao espaço de trabalho \"{{workspace}}\" no Fluxo Interno.\n\nE-mail: {{email}}\nSenha temporária: {{password}}\n\nFaça login e considere trocar sua senha.",
      context: {
        name: user.name,
        workspace: workspace.name,
        email: user.email,
        password: temporaryPassword,
      },
    }).catch(() => {});
  }

  return { user, temporaryPassword };
}

export async function updateWorkspaceMemberRoleForCurrentUser(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
) {
  await requireWorkspaceRole(workspaceId, "admin");

  await getDb()
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    );
}

export async function removeWorkspaceMemberForCurrentUser(
  workspaceId: string,
  userId: string,
) {
  const { session } = await requireWorkspaceRole(workspaceId, "admin");

  if (session.userId === userId) {
    throw new ConflictError(
      "Você não pode remover a si mesmo do espaço de trabalho.",
    );
  }

  await getDb()
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    );
}

export async function listBoardMembersForCurrentUser(boardId: string) {
  await requireBoardAccess(boardId, "manage");

  return getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: boardMembers.role,
      addedAt: boardMembers.addedAt,
    })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId))
    .orderBy(asc(users.name));
}

export async function listWorkspaceMemberOptionsForBoard(boardId: string) {
  const { board } = await requireBoardAccess(boardId, "manage");

  return getDb()
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, board.workspaceId))
    .orderBy(asc(users.name));
}

const addBoardMemberInputSchema = z.object({
  userId: uuidSchema,
  role: z.enum(["manager", "editor", "viewer"]),
});

export async function addBoardMemberForCurrentUser(
  boardId: string,
  input: { userId: string; role: BoardMemberRole },
) {
  const parsed = addBoardMemberInputSchema.parse(input);
  const { board } = await requireBoardAccess(boardId, "manage");

  const [membership] = await getDb()
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, board.id),
        eq(boardMembers.userId, parsed.userId),
      ),
    )
    .limit(1);

  if (membership) {
    throw new ConflictError("Este usuário já é membro deste quadro.");
  }

  await getDb()
    .insert(boardMembers)
    .values({ boardId: board.id, userId: parsed.userId, role: parsed.role });
}

export async function updateBoardMemberRoleForCurrentUser(
  boardId: string,
  userId: string,
  role: BoardMemberRole,
) {
  await requireBoardAccess(boardId, "manage");

  await getDb()
    .update(boardMembers)
    .set({ role })
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    );
}

export async function removeBoardMemberForCurrentUser(
  boardId: string,
  userId: string,
) {
  await requireBoardAccess(boardId, "manage");

  await getDb()
    .delete(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    );
}

export async function listIntakeFormsForBoard(boardId: string) {
  await requireBoardAccess(boardId, "manage");

  return getDb()
    .select()
    .from(intakeForms)
    .where(eq(intakeForms.boardId, boardId))
    .orderBy(asc(intakeForms.name));
}

export async function createIntakeFormForCurrentUser(
  input: CreateIntakeFormInput,
) {
  const parsed = createIntakeFormSchema.parse(input);
  const { board, session } = await requireBoardAccess(parsed.boardId, "manage");

  if (parsed.targetPhaseId) {
    const [phase] = await getDb()
      .select({ id: phases.id, boardId: phases.boardId })
      .from(phases)
      .where(eq(phases.id, parsed.targetPhaseId))
      .limit(1);

    if (!phase || phase.boardId !== board.id) {
      throw new ResourceNotFoundError(
        "Etapa de destino não encontrada neste quadro.",
      );
    }
  }

  const [created] = await getDb()
    .insert(intakeForms)
    .values({
      workspaceId: board.workspaceId,
      boardId: board.id,
      targetPhaseId: parsed.targetPhaseId ?? null,
      name: parsed.name,
      publicKey: randomBytes(16).toString("base64url"),
      description: parsed.description ?? null,
      successMessage: parsed.successMessage ?? null,
      status: parsed.status,
      requireRequesterEmail: parsed.requireRequesterEmail,
      createdBy: session.userId,
    })
    .returning();

  return created;
}

export async function updateIntakeFormForCurrentUser(
  formId: string,
  input: UpdateIntakeFormInput,
) {
  const parsed = updateIntakeFormSchema.parse(input);

  const [form] = await getDb()
    .select({ id: intakeForms.id, boardId: intakeForms.boardId })
    .from(intakeForms)
    .where(eq(intakeForms.id, formId))
    .limit(1);

  if (!form) {
    throw new ResourceNotFoundError("Formulário não encontrado.");
  }

  await requireBoardAccess(form.boardId, "manage");

  const [updated] = await getDb()
    .update(intakeForms)
    .set({
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined
        ? { description: parsed.description }
        : {}),
      ...(parsed.successMessage !== undefined
        ? { successMessage: parsed.successMessage }
        : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.requireRequesterEmail !== undefined
        ? { requireRequesterEmail: parsed.requireRequesterEmail }
        : {}),
      ...(parsed.targetPhaseId !== undefined
        ? { targetPhaseId: parsed.targetPhaseId }
        : {}),
    })
    .where(eq(intakeForms.id, formId))
    .returning();

  return updated;
}

export async function deleteIntakeFormForCurrentUser(formId: string) {
  const [form] = await getDb()
    .select({ id: intakeForms.id, boardId: intakeForms.boardId })
    .from(intakeForms)
    .where(eq(intakeForms.id, formId))
    .limit(1);

  if (!form) {
    throw new ResourceNotFoundError("Formulário não encontrado.");
  }

  await requireBoardAccess(form.boardId, "manage");

  await getDb().delete(intakeForms).where(eq(intakeForms.id, formId));
}

export async function listFormFieldsForForm(formId: string) {
  const [form] = await getDb()
    .select({ id: intakeForms.id, boardId: intakeForms.boardId })
    .from(intakeForms)
    .where(eq(intakeForms.id, formId))
    .limit(1);

  if (!form) {
    throw new ResourceNotFoundError("Formulário não encontrado.");
  }

  await requireBoardAccess(form.boardId, "manage");

  return getDb()
    .select()
    .from(formFields)
    .where(eq(formFields.formId, formId))
    .orderBy(asc(formFields.position));
}

export async function createFormFieldForCurrentUser(
  input: CreateFormFieldInput,
) {
  const parsed = createFormFieldSchema.parse(input);

  const [form] = await getDb()
    .select({ id: intakeForms.id, boardId: intakeForms.boardId })
    .from(intakeForms)
    .where(eq(intakeForms.id, parsed.formId))
    .limit(1);

  if (!form) {
    throw new ResourceNotFoundError("Formulário não encontrado.");
  }

  await requireBoardAccess(form.boardId, "manage");

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(formFields)
      .where(eq(formFields.formId, parsed.formId));

    const [created] = await tx
      .insert(formFields)
      .values({
        formId: parsed.formId,
        customFieldId: parsed.customFieldId ?? null,
        targetField: parsed.targetField ?? null,
        type: parsed.type,
        label: parsed.label,
        helpText: parsed.helpText ?? null,
        placeholder: parsed.placeholder ?? null,
        options: parsed.options,
        validation: parsed.validation,
        isRequired: parsed.isRequired,
        position: countRow.value,
      })
      .returning();

    return created;
  });
}

async function requireFormFieldAccess(fieldId: string) {
  const [field] = await getDb()
    .select({
      id: formFields.id,
      formId: formFields.formId,
      position: formFields.position,
    })
    .from(formFields)
    .where(eq(formFields.id, fieldId))
    .limit(1);

  if (!field) {
    throw new ResourceNotFoundError("Campo não encontrado.");
  }

  const [form] = await getDb()
    .select({ boardId: intakeForms.boardId })
    .from(intakeForms)
    .where(eq(intakeForms.id, field.formId))
    .limit(1);

  if (!form) {
    throw new ResourceNotFoundError("Formulário não encontrado.");
  }

  await requireBoardAccess(form.boardId, "manage");

  return { field, boardId: form.boardId };
}

export async function deleteFormFieldForCurrentUser(fieldId: string) {
  await requireFormFieldAccess(fieldId);

  await getDb().delete(formFields).where(eq(formFields.id, fieldId));
}

export async function updateFormFieldForCurrentUser(
  fieldId: string,
  input: UpdateFormFieldInput,
) {
  const parsed = updateFormFieldSchema.parse(input);
  await requireFormFieldAccess(fieldId);

  const [updated] = await getDb()
    .update(formFields)
    .set({
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.helpText !== undefined ? { helpText: parsed.helpText } : {}),
      ...(parsed.placeholder !== undefined
        ? { placeholder: parsed.placeholder }
        : {}),
      ...(parsed.options !== undefined ? { options: parsed.options } : {}),
      ...(parsed.isRequired !== undefined
        ? { isRequired: parsed.isRequired }
        : {}),
    })
    .where(eq(formFields.id, fieldId))
    .returning();

  return updated;
}

export async function moveFormFieldForCurrentUser(
  fieldId: string,
  direction: "left" | "right",
) {
  const { field } = await requireFormFieldAccess(fieldId);

  const siblings = await getDb()
    .select({ id: formFields.id, position: formFields.position })
    .from(formFields)
    .where(eq(formFields.formId, field.formId))
    .orderBy(asc(formFields.position));

  const index = siblings.findIndex((row) => row.id === fieldId);
  const targetIndex = direction === "left" ? index - 1 : index + 1;

  if (index === -1 || targetIndex < 0 || targetIndex >= siblings.length) {
    return;
  }

  const current = siblings[index];
  const target = siblings[targetIndex];

  await getDb().transaction(async (tx) => {
    await tx
      .update(formFields)
      .set({ position: target.position })
      .where(eq(formFields.id, current.id));
    await tx
      .update(formFields)
      .set({ position: current.position })
      .where(eq(formFields.id, target.id));
  });
}

const sendCardEmailInputSchema = z.object({
  cardId: uuidSchema,
  toAddresses: z.array(emailSchema).min(1).max(50),
  ccAddresses: z.array(emailSchema).max(50).default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
});

export async function sendCardEmailForCurrentUser(input: {
  cardId: string;
  toAddresses: string[];
  ccAddresses?: string[];
  subject: string;
  body: string;
}) {
  const parsed = sendCardEmailInputSchema.parse(input);
  const { card, board, session } = await requireCardBoardAccess(
    parsed.cardId,
    "edit",
  );

  const fromAddress = process.env.MAIL_FROM ?? "Fluxo Interno <noreply@localhost>";

  const [record] = await getDb()
    .insert(emailMessages)
    .values({
      workspaceId: board.workspaceId,
      cardId: card.id,
      direction: "outbound",
      status: "sending",
      fromAddress,
      toAddresses: parsed.toAddresses,
      ccAddresses: parsed.ccAddresses,
      subject: parsed.subject,
      textBody: parsed.body,
      createdBy: session.userId,
    })
    .returning();

  try {
    const result = await sendWorkflowEmail({
      to: parsed.toAddresses,
      cc: parsed.ccAddresses,
      subjectTemplate: parsed.subject,
      bodyTemplate: parsed.body,
      context: {},
    });

    await getDb()
      .update(emailMessages)
      .set({
        status: "sent",
        providerMessageId: result.providerId,
        sentAt: new Date(),
      })
      .where(eq(emailMessages.id, record.id));
  } catch (error) {
    await getDb()
      .update(emailMessages)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Erro desconhecido.",
        attempts: sql`${emailMessages.attempts} + 1`,
      })
      .where(eq(emailMessages.id, record.id));

    throw new ConflictError("Não foi possível enviar o e-mail agora.");
  }

  return record;
}
