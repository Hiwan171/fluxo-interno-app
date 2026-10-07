import "server-only";

import { randomBytes } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import {
  attachments,
  auditLogs,
  boardMembers,
  boardReports,
  boards,
  cardAssignees,
  cardFieldValues,
  cards,
  comments,
  customFields,
  emailAutomations,
  emailMessages,
  emailTemplates,
  formFields,
  intakeForms,
  phases,
  users,
  workspaceMembers,
  workspaces,
  type BoardMemberRole,
  type WorkspaceRole,
} from "@/db/schema";
import { buildAppLink } from "@/lib/app-url";
import type { UploadedFileMeta } from "@/lib/attachments";
import {
  getCurrentSession,
  hashPassword,
  issueAuthToken,
  revokeAllUserSessions,
  type AuthSession,
} from "@/lib/auth";
import { sendWorkflowEmail } from "@/lib/email";
import { renderEmailTemplate } from "@/lib/email-template";
import {
  CARD_EVENT_TYPES,
  listCardEvents,
  recordCardEvent,
  recordCardEventSafely,
} from "@/lib/events";
import {
  normalizeFieldValues,
  type FieldDefinition,
} from "@/lib/field-values";
import { logger } from "@/lib/logger";
import {
  queryReportCards,
  type ReportPage,
  type ReportQueryInput,
} from "@/lib/report-query";
import {
  createBoardSchema,
  createWorkspaceSchema,
  createCardSchema,
  createCommentSchema,
  createCustomFieldSchema,
  createEmailTemplateSchema,
  createFormFieldSchema,
  createIntakeFormSchema,
  createPhaseSchema,
  emailSchema,
  moveCardSchema,
  updateBoardSchema,
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
  type CreateWorkspaceInput,
  type CreateFormFieldInput,
  type CreateIntakeFormInput,
  type CreatePhaseInput,
  type UpdateBoardInput,
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

/**
 * Estados que continuam ocupando lugar no quadro.
 *
 * Um card numa fase final é `completed` mas segue visível na coluna — só
 * `archived` sai de cena. Filtrar apenas por `active`, como era antes de a fase
 * final passar a valer, faria o card sumir ao ser concluído.
 */
export const BOARD_VISIBLE_STATUSES = ["active", "completed"] as const;

/**
 * Teto de cards carregados por fase no quadro.
 *
 * Ninguém lê um kanban além das primeiras dezenas de cards de uma coluna — o
 * que passa disso é trabalho para o relatório, que tem filtro e paginação. Sem
 * teto, a página crescia com o quadro inteiro e travava o navegador.
 */
export const BOARD_PHASE_CARD_LIMIT = 100;

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
    createCardButtonLabel: string | null;
    expirationMinutes: number | null;
    kanbanVisibleFieldIds: string[];
    onlyAssigneeCanEdit: boolean;
    onlyManagerCanDeleteCards: boolean;
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
      createCardButtonLabel: boards.createCardButtonLabel,
      expirationMinutes: boards.expirationMinutes,
      kanbanVisibleFieldIds: boards.kanbanVisibleFieldIds,
      onlyAssigneeCanEdit: boards.onlyAssigneeCanEdit,
      onlyManagerCanDeleteCards: boards.onlyManagerCanDeleteCards,
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

/**
 * Cria um espaço de trabalho e coloca quem criou como proprietário.
 *
 * Só administradores do sistema criam workspaces: é a fronteira de isolamento
 * de dados da aplicação, não algo que qualquer membro deva multiplicar.
 */
export async function createWorkspaceForCurrentUser(
  input: CreateWorkspaceInput,
) {
  const parsed = createWorkspaceSchema.parse(input);
  const session = await requireSystemAdmin();

  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, parsed.slug))
      .limit(1);

    if (existing) {
      throw new ConflictError("Já existe um espaço de trabalho com este slug.");
    }

    const [created] = await tx
      .insert(workspaces)
      .values({
        name: parsed.name,
        slug: parsed.slug,
        timezone: parsed.timezone,
        createdBy: session.userId,
      })
      .returning();

    // Sem esta linha o criador não enxergaria o próprio workspace na lista, que
    // é montada a partir das associações.
    await tx.insert(workspaceMembers).values({
      workspaceId: created.id,
      userId: session.userId,
      role: "owner",
    });

    return created;
  });
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
        inArray(cards.status, BOARD_VISIBLE_STATUSES),
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

export async function updateBoardForCurrentUser(
  boardId: string,
  input: UpdateBoardInput,
) {
  const parsed = updateBoardSchema.parse(input);
  await requireBoardAccess(boardId, "manage");

  const [updated] = await getDb()
    .update(boards)
    .set({
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.color !== undefined ? { color: parsed.color } : {}),
      ...(parsed.description !== undefined
        ? { description: parsed.description }
        : {}),
      ...(parsed.icon !== undefined ? { icon: parsed.icon } : {}),
      ...(parsed.visibility !== undefined
        ? { visibility: parsed.visibility }
        : {}),
      ...(parsed.createCardButtonLabel !== undefined
        ? { createCardButtonLabel: parsed.createCardButtonLabel }
        : {}),
      ...(parsed.expirationMinutes !== undefined
        ? { expirationMinutes: parsed.expirationMinutes }
        : {}),
      ...(parsed.kanbanVisibleFieldIds !== undefined
        ? { kanbanVisibleFieldIds: parsed.kanbanVisibleFieldIds }
        : {}),
      ...(parsed.onlyAssigneeCanEdit !== undefined
        ? { onlyAssigneeCanEdit: parsed.onlyAssigneeCanEdit }
        : {}),
      ...(parsed.onlyManagerCanDeleteCards !== undefined
        ? { onlyManagerCanDeleteCards: parsed.onlyManagerCanDeleteCards }
        : {}),
    })
    .where(eq(boards.id, boardId))
    .returning();

  if (!updated) {
    throw new ResourceNotFoundError("Quadro não encontrado.");
  }

  return updated;
}

/**
 * Responsáveis, valores de campo, anexos e contagem de e-mails de um conjunto de
 * cards. Compartilhado entre o quadro e a busca: os dois precisam devolver o
 * card completo, não uma versão resumida.
 */
export async function loadCardExtras(cardIds: string[]) {
  const [assignees, fieldValues, emailCounts] = cardIds.length
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
        getDb()
          .select({
            cardId: emailMessages.cardId,
            count: sql<number>`count(*)::int`,
          })
          .from(emailMessages)
          .where(inArray(emailMessages.cardId, cardIds))
          .groupBy(emailMessages.cardId),
      ])
    : [[], [], []];

  const attachmentIds = fieldValues.flatMap((row) => {
    const value = row.value as { attachmentIds?: unknown } | null;
    return Array.isArray(value?.attachmentIds)
      ? (value.attachmentIds as string[])
      : [];
  });

  const attachmentRows = attachmentIds.length
    ? await getDb()
        .select({
          id: attachments.id,
          fileName: attachments.fileName,
          mimeType: attachments.mimeType,
          sizeBytes: attachments.sizeBytes,
        })
        .from(attachments)
        .where(inArray(attachments.id, attachmentIds))
    : [];

  return { assignees, fieldValues, emailCounts, attachments: attachmentRows };
}

export async function getBoardSnapshot(boardId: string) {
  const { board } = await requireBoardAccess(boardId, "view");

  const [boardPhases, boardCards, boardFields, boardForms] = await Promise.all([
    getDb()
      .select()
      .from(phases)
      .where(eq(phases.boardId, boardId))
      .orderBy(asc(phases.position)),
    // `row_number` corta por fase em vez de por quadro: uma coluna cheia não
    // pode consumir a cota das outras, que era o efeito de um `limit` simples.
    getDb()
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.boardId, boardId),
          inArray(cards.status, BOARD_VISIBLE_STATUSES),
          inArray(
            cards.id,
            getDb()
              .select({ id: sql<string>`ranked.id` })
              .from(
                sql`(
                  select
                    id,
                    row_number() over (
                      partition by phase_id
                      order by position asc, number asc
                    ) as rn
                  from cards
                  where board_id = ${boardId}
                    and status in ('active', 'completed')
                ) ranked`,
              )
              .where(sql`ranked.rn <= ${BOARD_PHASE_CARD_LIMIT}`),
          ),
        ),
      )
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

  const { assignees, fieldValues, emailCounts, attachments: boardAttachments } =
    await loadCardExtras(boardCards.map((card) => card.id));

  // Total real por fase, independente do teto de carregamento. A coluna precisa
  // dizer "50 de 340" em vez de mentir que existem só 50.
  const phaseTotals = await getDb()
    .select({
      phaseId: cards.phaseId,
      total: sql<number>`count(*)::int`,
    })
    .from(cards)
    .where(
      and(
        eq(cards.boardId, boardId),
        inArray(cards.status, BOARD_VISIBLE_STATUSES),
      ),
    )
    .groupBy(cards.phaseId);

  return {
    board,
    phases: boardPhases,
    cards: boardCards,
    customFields: boardFields,
    forms: boardForms,
    assignees,
    fieldValues,
    attachments: boardAttachments,
    emailCounts,
    phaseTotals,
    phaseCardLimit: BOARD_PHASE_CARD_LIMIT,
  };
}

/** Teto de resultados da busca no quadro. */
const BOARD_SEARCH_LIMIT = 300;

/**
 * Busca cards do quadro inteiro por título, número ou solicitante.
 *
 * O kanban carrega no máximo `BOARD_PHASE_CARD_LIMIT` cards por fase, então
 * filtrar no navegador só encontraria o que já estava à vista — quem procurasse
 * um card antigo concluiria que ele não existe.
 */
export async function searchBoardCardsForCurrentUser(
  boardId: string,
  query: string,
) {
  const { board } = await requireBoardAccess(boardId, "view");

  const term = query.trim();

  if (term.length < 2) return { cards: [], extras: await loadCardExtras([]), expirationMinutes: board.expirationMinutes };

  const pattern = `%${term}%`;
  const asNumber = Number(term.replace("#", ""));

  const matches = await getDb()
    .select()
    .from(cards)
    .where(
      and(
        eq(cards.boardId, boardId),
        inArray(cards.status, BOARD_VISIBLE_STATUSES),
        or(
          ilike(cards.title, pattern),
          ilike(cards.requesterName, pattern),
          ilike(cards.requesterEmail, pattern),
          ...(Number.isFinite(asNumber) ? [eq(cards.number, asNumber)] : []),
        ),
      ),
    )
    .orderBy(asc(cards.phaseId), asc(cards.position), asc(cards.number))
    .limit(BOARD_SEARCH_LIMIT);

  // O mesmo carregamento do quadro: o resultado precisa ser o card completo
  // (valores de campo, anexos, responsáveis), porque é ele que o painel de
  // detalhes abre quando o card encontrado está fora do teto por fase.
  const extras = await loadCardExtras(matches.map((card) => card.id));

  return { cards: matches, extras, expirationMinutes: board.expirationMinutes };
}

export async function getAttachmentForDownload(attachmentId: string) {
  const [row] = await getDb()
    .select({
      id: attachments.id,
      cardId: attachments.cardId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      storageKey: attachments.storageKey,
      boardId: cards.boardId,
    })
    .from(attachments)
    .innerJoin(cards, eq(cards.id, attachments.cardId))
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!row) {
    throw new ResourceNotFoundError("Anexo não encontrado.");
  }

  await requireBoardAccess(row.boardId, "view");

  return row;
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
    .select({
      id: cards.id,
      workspaceId: cards.workspaceId,
      boardId: cards.boardId,
      phaseId: cards.phaseId,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  const { session } = await requireBoardAccess(card.boardId, "edit");

  const [destinationPhase] = await getDb()
    .select({
      id: phases.id,
      boardId: phases.boardId,
      name: phases.name,
      cardLimit: phases.cardLimit,
      isFinal: phases.isFinal,
    })
    .from(phases)
    .where(eq(phases.id, destinationPhaseId))
    .limit(1);

  if (!destinationPhase || destinationPhase.boardId !== card.boardId) {
    throw new ResourceNotFoundError("Etapa não encontrada neste quadro.");
  }

  const changedPhase = card.phaseId !== destinationPhaseId;

  await getDb().transaction(async (tx) => {
    const affectedPhaseIds = Array.from(
      new Set([card.phaseId, destinationPhaseId]),
    );

    // `for update` trava as linhas das fases envolvidas até o fim da
    // transação. Sem isso, dois arrastes simultâneos liam a mesma ordem e
    // gravavam posições duplicadas por cima um do outro.
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
          inArray(cards.status, BOARD_VISIBLE_STATUSES),
          inArray(cards.phaseId, affectedPhaseIds),
        ),
      )
      .orderBy(asc(cards.phaseId), asc(cards.position))
      .for("update");

    if (changedPhase && destinationPhase.cardLimit != null) {
      const occupied = rows.filter(
        (row) => row.phaseId === destinationPhaseId,
      ).length;

      if (occupied >= destinationPhase.cardLimit) {
        throw new ConflictError(
          `A fase "${destinationPhase.name}" atingiu o limite de ${destinationPhase.cardLimit} cards.`,
        );
      }
    }

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

      await applyCardPositions(tx, [
        { phaseId: destinationPhaseId, ids: sourceList.map((row) => row.id) },
      ]);
      return;
    }

    const destinationList = byPhase.get(destinationPhaseId) ?? [];
    const clamped = Math.max(0, Math.min(position, destinationList.length));
    destinationList.splice(clamped, 0, {
      id: cardId,
      phaseId: destinationPhaseId,
      position: clamped,
    });

    await applyCardPositions(tx, [
      { phaseId: card.phaseId, ids: sourceList.map((row) => row.id) },
      { phaseId: destinationPhaseId, ids: destinationList.map((row) => row.id) },
    ]);

    await tx
      .update(cards)
      .set({
        phaseEnteredAt: new Date(),
        updatedBy: session.userId,
        // Entrar numa fase final conclui o card; sair dela o reabre.
        ...(destinationPhase.isFinal
          ? { status: "completed" as const, completedAt: new Date() }
          : { status: "active" as const, completedAt: null }),
      })
      .where(eq(cards.id, cardId));
  });

  if (!changedPhase) return;

  const [previousPhase] = await getDb()
    .select({ name: phases.name })
    .from(phases)
    .where(eq(phases.id, card.phaseId))
    .limit(1);

  await recordCardEventSafely({
    workspaceId: card.workspaceId,
    boardId: card.boardId,
    cardId,
    actorId: session.userId,
    type: CARD_EVENT_TYPES.moved,
    metadata: {
      fromPhaseId: card.phaseId,
      fromPhaseName: previousPhase?.name ?? null,
      toPhaseId: destinationPhaseId,
      toPhaseName: destinationPhase.name,
    },
  });

  if (destinationPhase.isFinal) {
    await recordCardEventSafely({
      workspaceId: card.workspaceId,
      boardId: card.boardId,
      cardId,
      actorId: session.userId,
      type: CARD_EVENT_TYPES.completed,
      metadata: { phaseName: destinationPhase.name },
    });
  }

  // Só enfileira. O envio acontece no worker — manter o SMTP no caminho do
  // arrastar-e-soltar travava a interface enquanto o servidor de e-mail
  // respondia, e uma falha virava apenas uma linha de log.
  try {
    await enqueuePhaseEmailAutomations(cardId, card.boardId, destinationPhaseId);
  } catch (error) {
    logger.error("email.automation.enqueue_failed", error, {
      cardId,
      boardId: card.boardId,
      phaseId: destinationPhaseId,
    });
  }
}

function formatCardFieldValueForEmail(
  type: string,
  value: unknown,
  options?: Array<{ label: string; value: string }>,
): string {
  if (value === null || value === undefined || value === "") return "";

  if (type === "checkbox") {
    return value === true || value === "true" ? "Sim" : "Não";
  }

  if ((type === "select" || type === "radio") && options) {
    return options.find((option) => option.value === value)?.label ?? String(value);
  }

  if (type === "attachment") {
    const files = Array.isArray((value as { files?: unknown } | null)?.files)
      ? (value as { files: Array<{ fileName: string }> }).files
      : [];
    return files.map((file) => file.fileName).join(", ");
  }

  if (typeof value === "object") return "";

  return String(value);
}

async function buildCardFieldEmailContext(
  cardId: string,
): Promise<Record<string, string>> {
  const rows = await getDb()
    .select({
      key: customFields.key,
      type: customFields.type,
      config: customFields.config,
      value: cardFieldValues.value,
    })
    .from(cardFieldValues)
    .innerJoin(customFields, eq(customFields.id, cardFieldValues.customFieldId))
    .where(eq(cardFieldValues.cardId, cardId));

  const context: Record<string, string> = {};
  for (const row of rows) {
    const options = Array.isArray((row.config as { options?: unknown })?.options)
      ? (row.config as { options: Array<{ label: string; value: string }> }).options
      : undefined;
    context[`campo.${row.key}`] = formatCardFieldValueForEmail(
      row.type,
      row.value,
      options,
    );
  }

  return context;
}

async function enqueuePhaseEmailAutomations(
  cardId: string,
  boardId: string,
  phaseId: string,
) {
  const automations = await getDb()
    .select({
      id: emailAutomations.id,
      templateId: emailAutomations.templateId,
      recipientType: emailAutomations.recipientType,
      recipientEmails: emailAutomations.recipientEmails,
    })
    .from(emailAutomations)
    .where(
      and(
        eq(emailAutomations.boardId, boardId),
        eq(emailAutomations.triggerPhaseId, phaseId),
        eq(emailAutomations.isActive, true),
      ),
    );

  if (automations.length === 0) return;

  const [card] = await getDb()
    .select({
      id: cards.id,
      number: cards.number,
      title: cards.title,
      requesterName: cards.requesterName,
      requesterEmail: cards.requesterEmail,
      workspaceId: cards.workspaceId,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) return;

  const [phase] = await getDb()
    .select({ name: phases.name })
    .from(phases)
    .where(eq(phases.id, phaseId))
    .limit(1);

  const templates = await getDb()
    .select()
    .from(emailTemplates)
    .where(
      inArray(
        emailTemplates.id,
        automations.map((automation) => automation.templateId),
      ),
    );
  const templateById = new Map(templates.map((template) => [template.id, template]));

  const fieldContext = await buildCardFieldEmailContext(cardId);
  const context = {
    card_title: card.title,
    card_reference: `#${card.number}`,
    requester_name: card.requesterName ?? "",
    phase_name: phase?.name ?? "",
    ...fieldContext,
  };

  const fromAddress = process.env.MAIL_FROM ?? "Fluxo Interno <noreply@localhost>";

  const queued: string[] = [];

  for (const automation of automations) {
    const template = templateById.get(automation.templateId);
    if (!template || !template.isActive) continue;

    const toAddresses =
      automation.recipientType === "fixed"
        ? automation.recipientEmails
        : card.requesterEmail
          ? [card.requesterEmail]
          : [];
    if (toAddresses.length === 0) continue;

    // Grava como `queued`: a coluna, o `scheduledAt` e o indice de fila ja
    // existiam no schema desde o inicio e nunca haviam sido usados.
    const [record] = await getDb()
      .insert(emailMessages)
      .values({
        workspaceId: card.workspaceId,
        cardId: card.id,
        templateId: template.id,
        direction: "outbound",
        status: "queued",
        scheduledAt: new Date(),
        fromAddress,
        toAddresses,
        subject: renderEmailTemplate(template.subject, context),
        textBody: template.textBody
          ? renderEmailTemplate(template.textBody, context)
          : null,
      })
      .returning({ id: emailMessages.id });

    queued.push(record.id);
  }

  if (queued.length > 0) {
    logger.info("email.automation.enqueued", {
      cardId,
      phaseId,
      count: queued.length,
    });
  }
}

export async function createCardForCurrentUser(input: CreateCardInput) {
  const parsed = createCardSchema.parse(input);
  const { board, session } = await requireBoardAccess(
    parsed.boardId,
    "edit",
  );

  const [phase] = await getDb()
    .select({
      id: phases.id,
      boardId: phases.boardId,
      name: phases.name,
      cardLimit: phases.cardLimit,
      isFinal: phases.isFinal,
    })
    .from(phases)
    .where(eq(phases.id, parsed.phaseId))
    .limit(1);

  if (!phase || phase.boardId !== board.id) {
    throw new ResourceNotFoundError("Etapa não encontrada neste quadro.");
  }

  return getDb().transaction(async (tx) => {
    await assertPhaseHasRoom(tx, phase.id, phase.name, phase.cardLimit);

    const number = await nextCardNumber(tx, board.id);

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(cards)
      .where(
        and(eq(cards.phaseId, parsed.phaseId), inArray(cards.status, BOARD_VISIBLE_STATUSES)),
      );

    const [created] = await tx
      .insert(cards)
      .values({
        workspaceId: board.workspaceId,
        boardId: board.id,
        phaseId: parsed.phaseId,
        number,
        title: parsed.title,
        description: parsed.description ?? null,
        priority: parsed.priority,
        position: countRow.value,
        requesterName: parsed.requesterName ?? null,
        requesterEmail: parsed.requesterEmail ?? null,
        dueAt: parsed.dueAt ?? null,
        // Criar direto numa fase final já nasce concluído; o status
        // `completed` do enum era inalcançável antes disto.
        ...(phase.isFinal
          ? { status: "completed" as const, completedAt: new Date() }
          : {}),
        source: parsed.source,
        sourceFormId: parsed.sourceFormId ?? null,
        createdBy: session.userId,
        updatedBy: session.userId,
      })
      .returning();

    await upsertCardFieldValues(tx, board.id, created.id, parsed.fieldValues);

    await recordCardEvent(
      {
        workspaceId: board.workspaceId,
        boardId: board.id,
        cardId: created.id,
        actorId: session.userId,
        type: CARD_EVENT_TYPES.created,
        metadata: { phaseName: phase.name, source: parsed.source },
      },
      tx,
    );

    return created;
  });
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

type PendingAttachmentValue = {
  kind: "attachment";
  files: UploadedFileMeta[];
};

function isPendingAttachmentValue(
  value: unknown,
): value is PendingAttachmentValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "attachment"
  );
}

async function resolveFieldValueForStorage(
  tx: Tx,
  cardId: string,
  customFieldId: string,
  rawValue: unknown,
) {
  if (!isPendingAttachmentValue(rawValue)) return rawValue;

  if (rawValue.files.length === 0) return { attachmentIds: [] };

  const inserted = await tx
    .insert(attachments)
    .values(
      rawValue.files.map((file) => ({
        cardId,
        customFieldId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageKey: file.storageKey,
      })),
    )
    .returning({ id: attachments.id });

  return { attachmentIds: inserted.map((row) => row.id) };
}

/**
 * Reescreve posição e fase de vários cards num único comando.
 *
 * A versão anterior emitia um `UPDATE` por card em laço: mover um card no topo
 * de uma fase com 200 cards custava 200 idas ao banco dentro da transação, com
 * as linhas travadas o tempo todo.
 */
async function applyCardPositions(
  tx: Tx,
  groups: Array<{ phaseId: string; ids: string[] }>,
) {
  const rows = groups.flatMap((group) =>
    group.ids.map((id, index) => ({
      id,
      position: index,
      phaseId: group.phaseId,
    })),
  );

  if (rows.length === 0) return;

  const values = sql.join(
    rows.map(
      (row) =>
        sql`(${row.id}::uuid, ${row.position}::integer, ${row.phaseId}::uuid)`,
    ),
    sql`, `,
  );

  await tx.execute(sql`
    update cards as c
    set position = v.position, phase_id = v.phase_id
    from (values ${values}) as v(id, position, phase_id)
    where c.id = v.id
  `);
}

/** Carrega as definições dos campos ativos de um quadro. */
async function loadBoardFieldDefinitions(
  executor: Tx | Database,
  boardId: string,
): Promise<FieldDefinition[]> {
  return executor
    .select({
      id: customFields.id,
      label: customFields.label,
      type: customFields.type,
      config: customFields.config,
      isRequired: customFields.isRequired,
    })
    .from(customFields)
    .where(
      and(eq(customFields.boardId, boardId), eq(customFields.isArchived, false)),
    );
}

/**
 * Grava os valores de campo depois de validá-los contra as definições do quadro
 * a que o card pertence. As definições vêm do banco dentro da mesma transação —
 * confiar no que o formulário mandou permitiria escrever em campos de outro
 * quadro e gravar qualquer coisa em qualquer tipo.
 */
async function upsertCardFieldValues(
  tx: Tx,
  boardId: string,
  cardId: string,
  fieldValues: Record<string, unknown>,
) {
  const entries = Object.entries(fieldValues);
  if (entries.length === 0) return;

  const definitions = await loadBoardFieldDefinitions(tx, boardId);
  const normalized = normalizeFieldValues(definitions, fieldValues);

  for (const [customFieldId, normalizedValue] of Object.entries(normalized)) {
    const value = await resolveFieldValueForStorage(
      tx,
      cardId,
      customFieldId,
      normalizedValue,
    );
    await tx
      .insert(cardFieldValues)
      .values({ cardId, customFieldId, value })
      .onConflictDoUpdate({
        target: [cardFieldValues.cardId, cardFieldValues.customFieldId],
        set: { value },
      });
  }
}

/**
 * Reserva o próximo número do quadro incrementando o contador da linha.
 * O `UPDATE ... RETURNING` trava a linha até o fim da transação, o que
 * serializa criações concorrentes — `max(number) + 1` devolvia o mesmo valor
 * para duas transações simultâneas e a segunda violava a unicidade.
 */
async function nextCardNumber(tx: Tx, boardId: string): Promise<number> {
  const [row] = await tx
    .update(boards)
    .set({ cardSequence: sql`${boards.cardSequence} + 1` })
    .where(eq(boards.id, boardId))
    .returning({ value: boards.cardSequence });

  if (!row) {
    throw new ResourceNotFoundError("Quadro não encontrado.");
  }

  return row.value;
}

/**
 * Recusa a entrada quando a fase já atingiu o limite configurado.
 * O limite era salvo e exibido, mas nada o aplicava.
 */
async function assertPhaseHasRoom(
  tx: Tx,
  phaseId: string,
  phaseName: string,
  cardLimit: number | null,
) {
  if (cardLimit == null) return;

  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(cards)
    .where(and(eq(cards.phaseId, phaseId), inArray(cards.status, BOARD_VISIBLE_STATUSES)));

  if ((row?.value ?? 0) >= cardLimit) {
    throw new ConflictError(
      `A fase "${phaseName}" atingiu o limite de ${cardLimit} cards.`,
    );
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

/**
 * Quem pode alterar o card: editor do quadro e, quando o quadro restringe a
 * edição ao responsável, só quem está atribuído (administradores e gerentes
 * ficam fora da restrição). Compartilhado por tudo que escreve no card.
 */
export async function requireCardEditAccess(cardId: string) {
  const [card] = await getDb()
    .select({
      id: cards.id,
      boardId: cards.boardId,
      number: cards.number,
      title: cards.title,
      requesterName: cards.requesterName,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new ResourceNotFoundError("Card não encontrado.");
  }

  const access = await requireBoardAccess(card.boardId, "edit");
  const { session, board, workspaceRole, boardRole } = access;

  const isExemptFromAssigneeRule =
    session.user.systemRole === "admin" ||
    workspaceRole === "owner" ||
    workspaceRole === "admin" ||
    boardRole === "manager";

  if (board.onlyAssigneeCanEdit && !isExemptFromAssigneeRule) {
    const assignee = await isCardAssignee(session.userId, cardId);
    if (!assignee) {
      throw new AuthorizationError();
    }
  }

  return { card, ...access };
}

export async function updateCardForCurrentUser(
  cardId: string,
  input: UpdateCardInput,
) {
  const parsed = updateCardSchema.parse(input);

  const { card, session, board } = await requireCardEditAccess(cardId);

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
      await upsertCardFieldValues(tx, card.boardId, cardId, parsed.fieldValues);
    }

    await recordCardEvent(
      {
        workspaceId: board.workspaceId,
        boardId: card.boardId,
        cardId,
        actorId: session.userId,
        type: CARD_EVENT_TYPES.updated,
        metadata: { fields: Object.keys(parsed) },
      },
      tx,
    );

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
    const number = await nextCardNumber(tx, original.boardId);

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(cards)
      .where(
        and(eq(cards.phaseId, original.phaseId), inArray(cards.status, BOARD_VISIBLE_STATUSES)),
      );

    const [created] = await tx
      .insert(cards)
      .values({
        workspaceId: original.workspaceId,
        boardId: original.boardId,
        phaseId: original.phaseId,
        number,
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

    // Copiar só o "casco" do card tornava a duplicação quase inútil: o valor
    // dela está em não reprencher o formulário inteiro.
    const originalValues = await tx
      .select({
        customFieldId: cardFieldValues.customFieldId,
        value: cardFieldValues.value,
      })
      .from(cardFieldValues)
      .where(eq(cardFieldValues.cardId, cardId));

    if (originalValues.length > 0) {
      await tx.insert(cardFieldValues).values(
        originalValues.map((row) => ({
          cardId: created.id,
          customFieldId: row.customFieldId,
          // Os anexos são referenciados pelo mesmo id, não duplicados em
          // disco — é o comportamento do Pipefy e evita inflar o volume.
          value: row.value,
        })),
      );
    }

    const originalAssignees = await tx
      .select({ userId: cardAssignees.userId })
      .from(cardAssignees)
      .where(eq(cardAssignees.cardId, cardId));

    if (originalAssignees.length > 0) {
      await tx.insert(cardAssignees).values(
        originalAssignees.map((row) => ({
          cardId: created.id,
          userId: row.userId,
          assignedBy: session.userId,
        })),
      );
    }

    await recordCardEvent(
      {
        workspaceId: original.workspaceId,
        boardId: original.boardId,
        cardId: created.id,
        actorId: session.userId,
        type: CARD_EVENT_TYPES.created,
        metadata: { duplicatedFromCardId: cardId, duplicatedFromNumber: original.number },
      },
      tx,
    );

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

  const { board, session } = await requireBoardAccess(card.boardId, "edit");

  if (board.onlyManagerCanDeleteCards) {
    await requireBoardAccess(card.boardId, "manage");
  }

  await getDb()
    .update(cards)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(cards.id, cardId));

  await recordCardEventSafely({
    workspaceId: board.workspaceId,
    boardId: card.boardId,
    cardId,
    actorId: session.userId,
    type: CARD_EVENT_TYPES.archived,
  });
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

  const [cardComments, cardEmails, cardHistory] = await Promise.all([
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
        fromAddress: emailMessages.fromAddress,
        toAddresses: emailMessages.toAddresses,
        ccAddresses: emailMessages.ccAddresses,
        subject: emailMessages.subject,
        textBody: emailMessages.textBody,
        errorMessage: emailMessages.errorMessage,
        templateId: emailMessages.templateId,
        sentAt: emailMessages.sentAt,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(eq(emailMessages.cardId, cardId))
      .orderBy(desc(emailMessages.createdAt)),
    listCardEvents(cardId),
  ]);

  return { comments: cardComments, emails: cardEmails, history: cardHistory };
}

export async function listEmailsForBoard(boardId: string) {
  await requireBoardAccess(boardId, "view");

  const [rows, assigneeRows] = await Promise.all([
    getDb()
      .select({
        id: emailMessages.id,
        status: emailMessages.status,
        fromAddress: emailMessages.fromAddress,
        toAddresses: emailMessages.toAddresses,
        subject: emailMessages.subject,
        textBody: emailMessages.textBody,
        errorMessage: emailMessages.errorMessage,
        sentAt: emailMessages.sentAt,
        createdAt: emailMessages.createdAt,
        readAt: emailMessages.readAt,
        cardId: cards.id,
        cardNumber: cards.number,
        cardTitle: cards.title,
        cardPhaseId: cards.phaseId,
        requesterName: cards.requesterName,
        requesterEmail: cards.requesterEmail,
      })
      .from(emailMessages)
      .innerJoin(cards, eq(cards.id, emailMessages.cardId))
      .where(eq(cards.boardId, boardId))
      .orderBy(desc(emailMessages.createdAt)),
    getDb()
      .select({ cardId: cardAssignees.cardId, userId: cardAssignees.userId })
      .from(cardAssignees)
      .innerJoin(cards, eq(cards.id, cardAssignees.cardId))
      .where(eq(cards.boardId, boardId)),
  ]);

  const assigneesByCard = new Map<string, string[]>();
  for (const row of assigneeRows) {
    const list = assigneesByCard.get(row.cardId) ?? [];
    list.push(row.userId);
    assigneesByCard.set(row.cardId, list);
  }

  return rows.map((row) => ({
    ...row,
    assigneeUserIds: assigneesByCard.get(row.cardId) ?? [],
  }));
}

export async function markEmailReadForCurrentUser(emailId: string) {
  const [email] = await getDb()
    .select({ id: emailMessages.id, cardId: emailMessages.cardId, readAt: emailMessages.readAt })
    .from(emailMessages)
    .where(eq(emailMessages.id, emailId))
    .limit(1);

  if (!email) {
    throw new ResourceNotFoundError("E-mail não encontrado.");
  }

  if (email.cardId) {
    await requireCardBoardAccess(email.cardId, "view");
  }

  if (email.readAt) return;

  await getDb()
    .update(emailMessages)
    .set({ readAt: new Date() })
    .where(eq(emailMessages.id, emailId));
}

export async function listEmailTemplatesForBoard(boardId: string) {
  await requireBoardAccess(boardId, "view");

  return getDb()
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.boardId, boardId))
    .orderBy(asc(emailTemplates.name));
}

function slugifyTemplateKey(label: string) {
  const cleaned = label
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = /^[a-z]/.test(cleaned) ? cleaned : `template_${cleaned}`;

  return `${(base || "template").slice(0, 60)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createEmailTemplateForCurrentUser(input: {
  boardId: string;
  name: string;
  subject: string;
  textBody: string;
}) {
  const { board, session } = await requireBoardAccess(input.boardId, "view");

  const parsed = createEmailTemplateSchema.parse({
    workspaceId: board.workspaceId,
    boardId: board.id,
    key: slugifyTemplateKey(input.name),
    name: input.name,
    subject: input.subject,
    textBody: input.textBody,
    isActive: true,
  });

  const [created] = await getDb()
    .insert(emailTemplates)
    .values({
      workspaceId: parsed.workspaceId,
      boardId: parsed.boardId,
      key: parsed.key,
      name: parsed.name,
      subject: parsed.subject,
      textBody: parsed.textBody ?? null,
      htmlBody: parsed.htmlBody ?? null,
      isActive: parsed.isActive,
      createdBy: session.userId,
    })
    .returning();

  return created;
}

export async function updateEmailTemplateForCurrentUser(
  templateId: string,
  input: { name?: string; subject?: string; textBody?: string; isActive?: boolean },
) {
  const [template] = await getDb()
    .select({ id: emailTemplates.id, boardId: emailTemplates.boardId })
    .from(emailTemplates)
    .where(eq(emailTemplates.id, templateId))
    .limit(1);

  if (!template || !template.boardId) {
    throw new ResourceNotFoundError("Template não encontrado.");
  }

  await requireBoardAccess(template.boardId, "view");

  const [updated] = await getDb()
    .update(emailTemplates)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.textBody !== undefined ? { textBody: input.textBody } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(emailTemplates.id, templateId))
    .returning();

  return updated;
}

export async function deleteEmailTemplateForCurrentUser(templateId: string) {
  const [template] = await getDb()
    .select({ id: emailTemplates.id, boardId: emailTemplates.boardId })
    .from(emailTemplates)
    .where(eq(emailTemplates.id, templateId))
    .limit(1);

  if (!template || !template.boardId) {
    throw new ResourceNotFoundError("Template não encontrado.");
  }

  await requireBoardAccess(template.boardId, "view");

  await getDb().delete(emailTemplates).where(eq(emailTemplates.id, templateId));
}

export async function listEmailAutomationsForBoard(boardId: string) {
  await requireBoardAccess(boardId, "view");

  return getDb()
    .select({
      id: emailAutomations.id,
      name: emailAutomations.name,
      triggerPhaseId: emailAutomations.triggerPhaseId,
      triggerPhaseName: phases.name,
      templateId: emailAutomations.templateId,
      templateName: emailTemplates.name,
      recipientType: emailAutomations.recipientType,
      recipientEmails: emailAutomations.recipientEmails,
      isActive: emailAutomations.isActive,
      createdAt: emailAutomations.createdAt,
    })
    .from(emailAutomations)
    .innerJoin(phases, eq(phases.id, emailAutomations.triggerPhaseId))
    .innerJoin(emailTemplates, eq(emailTemplates.id, emailAutomations.templateId))
    .where(eq(emailAutomations.boardId, boardId))
    .orderBy(asc(emailAutomations.name));
}

export async function createEmailAutomationForCurrentUser(input: {
  boardId: string;
  name: string;
  triggerPhaseId: string;
  templateId: string;
  recipientEmails?: string[];
}) {
  const { board, session } = await requireBoardAccess(input.boardId, "view");

  const [phase] = await getDb()
    .select({ id: phases.id, boardId: phases.boardId })
    .from(phases)
    .where(eq(phases.id, input.triggerPhaseId))
    .limit(1);
  if (!phase || phase.boardId !== board.id) {
    throw new ResourceNotFoundError("Fase não encontrada neste quadro.");
  }

  const [template] = await getDb()
    .select({ id: emailTemplates.id, boardId: emailTemplates.boardId })
    .from(emailTemplates)
    .where(eq(emailTemplates.id, input.templateId))
    .limit(1);
  if (!template || template.boardId !== board.id) {
    throw new ResourceNotFoundError("Template não encontrado neste quadro.");
  }

  const recipientEmails = (input.recipientEmails ?? []).filter(Boolean);
  const recipientType = recipientEmails.length > 0 ? "fixed" : "requester";

  const [created] = await getDb()
    .insert(emailAutomations)
    .values({
      workspaceId: board.workspaceId,
      boardId: board.id,
      name: input.name,
      triggerPhaseId: input.triggerPhaseId,
      templateId: input.templateId,
      recipientType,
      recipientEmails,
      createdBy: session.userId,
    })
    .returning();

  return created;
}

export async function updateEmailAutomationForCurrentUser(
  automationId: string,
  input: { isActive?: boolean },
) {
  const [automation] = await getDb()
    .select({ id: emailAutomations.id, boardId: emailAutomations.boardId })
    .from(emailAutomations)
    .where(eq(emailAutomations.id, automationId))
    .limit(1);

  if (!automation) {
    throw new ResourceNotFoundError("Automação não encontrada.");
  }

  await requireBoardAccess(automation.boardId, "view");

  const [updated] = await getDb()
    .update(emailAutomations)
    .set({
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(emailAutomations.id, automationId))
    .returning();

  return updated;
}

export async function deleteEmailAutomationForCurrentUser(automationId: string) {
  const [automation] = await getDb()
    .select({ id: emailAutomations.id, boardId: emailAutomations.boardId })
    .from(emailAutomations)
    .where(eq(emailAutomations.id, automationId))
    .limit(1);

  if (!automation) {
    throw new ResourceNotFoundError("Automação não encontrada.");
  }

  await requireBoardAccess(automation.boardId, "view");

  await getDb().delete(emailAutomations).where(eq(emailAutomations.id, automationId));
}

/**
 * Página de um relatório, com filtro, ordenação e paginação resolvidos no
 * banco. Substituiu o carregamento integral do quadro seguido de filtragem no
 * navegador.
 */
export async function queryReportCardsForCurrentUser(
  boardId: string,
  input: ReportQueryInput,
): Promise<ReportPage> {
  await requireBoardAccess(boardId, "view");

  return queryReportCards(boardId, input);
}

export async function countAllCardsForBoard(boardId: string) {
  await requireBoardAccess(boardId, "view");

  const [row] = await getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(cards)
    .where(eq(cards.boardId, boardId));

  return row.value;
}

export async function listBoardReports(boardId: string) {
  await requireBoardAccess(boardId, "view");

  return getDb()
    .select()
    .from(boardReports)
    .where(eq(boardReports.boardId, boardId))
    .orderBy(asc(boardReports.name));
}

export async function getBoardReportForCurrentUser(reportId: string) {
  const [report] = await getDb()
    .select()
    .from(boardReports)
    .where(eq(boardReports.id, reportId))
    .limit(1);

  if (!report) {
    throw new ResourceNotFoundError("Relatório não encontrado.");
  }

  await requireBoardAccess(report.boardId, "view");

  return report;
}

export async function createBoardReportForCurrentUser(input: {
  boardId: string;
  name: string;
}) {
  const { board, session } = await requireBoardAccess(input.boardId, "view");

  const [created] = await getDb()
    .insert(boardReports)
    .values({
      workspaceId: board.workspaceId,
      boardId: board.id,
      name: input.name,
      createdBy: session.userId,
    })
    .returning();

  return created;
}

export async function updateBoardReportForCurrentUser(
  reportId: string,
  input: {
    name?: string;
    filters?: Array<{ fieldId: string; value: string; valueTo: string }>;
    visibleColumns?: string[];
    sortField?: string;
    sortDir?: "asc" | "desc";
  },
) {
  const [report] = await getDb()
    .select({ id: boardReports.id, boardId: boardReports.boardId })
    .from(boardReports)
    .where(eq(boardReports.id, reportId))
    .limit(1);

  if (!report) {
    throw new ResourceNotFoundError("Relatório não encontrado.");
  }

  await requireBoardAccess(report.boardId, "view");

  const [updated] = await getDb()
    .update(boardReports)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
      ...(input.visibleColumns !== undefined
        ? { visibleColumns: input.visibleColumns }
        : {}),
      ...(input.sortField !== undefined ? { sortField: input.sortField } : {}),
      ...(input.sortDir !== undefined ? { sortDir: input.sortDir } : {}),
    })
    .where(eq(boardReports.id, reportId))
    .returning();

  return updated;
}

export async function deleteBoardReportForCurrentUser(reportId: string) {
  const [report] = await getDb()
    .select({ id: boardReports.id, boardId: boardReports.boardId })
    .from(boardReports)
    .where(eq(boardReports.id, reportId))
    .limit(1);

  if (!report) {
    throw new ResourceNotFoundError("Relatório não encontrado.");
  }

  await requireBoardAccess(report.boardId, "view");

  await getDb().delete(boardReports).where(eq(boardReports.id, reportId));
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

  if (parsed.phaseId) {
    const [phase] = await getDb()
      .select({ id: phases.id, boardId: phases.boardId })
      .from(phases)
      .where(eq(phases.id, parsed.phaseId))
      .limit(1);
    if (!phase || phase.boardId !== board.id) {
      throw new ResourceNotFoundError("Fase não encontrada neste quadro.");
    }
  }

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(customFields)
      .where(eq(customFields.boardId, board.id));

    const [created] = await tx
      .insert(customFields)
      .values({
        boardId: board.id,
        phaseId: parsed.phaseId ?? null,
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

/** Visão de todos os workspaces com contagens, para a tela de administração. */
export async function listAllWorkspacesForCurrentUser() {
  await requireSystemAdmin();

  const [rows, memberCounts, boardCounts] = await Promise.all([
    getDb()
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
      })
      .from(workspaces)
      .orderBy(asc(workspaces.name)),
    getDb()
      .select({
        workspaceId: workspaceMembers.workspaceId,
        value: sql<number>`count(*)::int`,
      })
      .from(workspaceMembers)
      .groupBy(workspaceMembers.workspaceId),
    getDb()
      .select({
        workspaceId: boards.workspaceId,
        value: sql<number>`count(*)::int`,
      })
      .from(boards)
      .groupBy(boards.workspaceId),
  ]);

  const membersByWorkspace = new Map(
    memberCounts.map((row) => [row.workspaceId, row.value]),
  );
  const boardsByWorkspace = new Map(
    boardCounts.map((row) => [row.workspaceId, row.value]),
  );

  return rows.map((row) => ({
    ...row,
    memberCount: membersByWorkspace.get(row.id) ?? 0,
    boardCount: boardsByWorkspace.get(row.id) ?? 0,
  }));
}

export async function listSystemUsersForCurrentUser() {
  await requireSystemAdmin();

  return getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      systemRole: users.systemRole,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.name));
}

/**
 * Ativa ou desativa uma conta.
 *
 * Desativar precisa derrubar as sessões: `readStoredSession` já exige
 * `isActive`, mas o cookie continuaria válido até a próxima leitura e a pessoa
 * seguiria navegando em páginas já renderizadas.
 */
export async function setUserActiveForCurrentUser(
  userId: string,
  isActive: boolean,
) {
  const session = await requireSystemAdmin();

  if (session.userId === userId && !isActive) {
    throw new ConflictError("Você não pode desativar a sua própria conta.");
  }

  const [updated] = await getDb()
    .update(users)
    .set({ isActive })
    .where(eq(users.id, userId))
    .returning({ id: users.id, email: users.email });

  if (!updated) {
    throw new ResourceNotFoundError("Usuário não encontrado.");
  }

  if (!isActive) {
    await revokeAllUserSessions(userId);
  }

  await getDb().insert(auditLogs).values({
    actorId: session.userId,
    action: isActive ? "user.activated" : "user.deactivated",
    entityType: "user",
    entityId: userId,
    result: "success",
    details: { email: updated.email },
  });
}

/**
 * Promove ou rebaixa um administrador do sistema.
 *
 * O papel `admin` ignora toda a autorização por workspace, então o mesmo
 * cuidado do nível de workspace vale aqui: ninguém altera o próprio papel, e o
 * sistema não pode ficar sem nenhum administrador.
 */
export async function setUserSystemRoleForCurrentUser(
  userId: string,
  systemRole: "admin" | "user",
) {
  const session = await requireSystemAdmin();

  if (session.userId === userId) {
    throw new ConflictError("Você não pode alterar o seu próprio papel.");
  }

  if (systemRole === "user") {
    const [row] = await getDb()
      .select({ value: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.systemRole, "admin"), eq(users.isActive, true)));

    if ((row?.value ?? 0) <= 1) {
      throw new ConflictError(
        "Este é o último administrador ativo do sistema e não pode ser rebaixado.",
      );
    }
  }

  const [updated] = await getDb()
    .update(users)
    .set({ systemRole })
    .where(eq(users.id, userId))
    .returning({ id: users.id, email: users.email });

  if (!updated) {
    throw new ResourceNotFoundError("Usuário não encontrado.");
  }

  await getDb().insert(auditLogs).values({
    actorId: session.userId,
    action: "user.system_role_changed",
    entityType: "user",
    entityId: userId,
    result: "success",
    details: { email: updated.email, systemRole },
  });
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
  const { workspace, session } = await requireWorkspaceRole(workspaceId, "admin");
  const email = parsed.email;

  let [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  let isNewUser = false;

  if (!user) {
    // A conta nasce sem senha utilizável: o hash é de um valor aleatório que
    // ninguém conhece, então o único caminho de entrada é o link do convite.
    const unusablePassword = await hashPassword(randomBytes(32).toString("base64url"));
    [user] = await getDb()
      .insert(users)
      .values({
        email,
        name: parsed.name,
        passwordHash: unusablePassword,
        systemRole: "user",
      })
      .returning();
    isNewUser = true;
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

  if (isNewUser) {
    const { token } = await issueAuthToken(user.id, "invite", session.userId);
    const inviteUrl = await buildAppLink(`/definir-senha/${token}`);

    await sendWorkflowEmail({
      to: [user.email],
      subjectTemplate: "Seu acesso ao espaço {{workspace}}",
      bodyTemplate:
        'Olá {{name}},\n\nVocê agora tem acesso ao espaço de trabalho "{{workspace}}" no Fluxo Interno.\n\nDefina sua senha por este link:\n{{link}}\n\nO link vale por 7 dias e só pode ser usado uma vez. Se não foi você que pediu este acesso, ignore esta mensagem.',
      context: {
        name: user.name,
        workspace: workspace.name,
        link: inviteUrl,
      },
    }).catch(() => {});
  }

  return { user, isNewUser };
}

/**
 * Gera um link de redefinição para outro membro. Substitui o antigo hábito de
 * o administrador definir uma senha e comunicá-la — aqui ninguém, nem quem
 * administra, chega a conhecer a senha do outro.
 */
export async function issuePasswordResetForMemberForCurrentUser(
  workspaceId: string,
  userId: string,
) {
  const { session } = await requireWorkspaceRole(workspaceId, "admin");

  const membership = await getWorkspaceMembership(workspaceId, userId);

  if (!membership) {
    throw new ResourceNotFoundError(
      "Este usuário não é membro deste espaço de trabalho.",
    );
  }

  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new ResourceNotFoundError("Usuário não encontrado.");
  }

  const { token } = await issueAuthToken(user.id, "password_reset", session.userId);
  const resetUrl = await buildAppLink(`/definir-senha/${token}`);

  await sendWorkflowEmail({
    to: [user.email],
    subjectTemplate: "Redefinição de senha do Fluxo Interno",
    bodyTemplate:
      "Olá {{name}},\n\nFoi solicitada uma redefinição de senha para a sua conta.\n\nDefina uma nova senha por este link:\n{{link}}\n\nO link vale por 2 horas e só pode ser usado uma vez. Se não foi você, ignore esta mensagem — sua senha atual continua valendo.",
    context: { name: user.name, link: resetUrl },
  }).catch(() => {});

  return { email: user.email };
}

const workspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);

async function getWorkspaceMembership(workspaceId: string, userId: string) {
  const [row] = await getDb()
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function countWorkspaceOwners(workspaceId: string) {
  const [row] = await getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, "owner"),
      ),
    );

  return row?.value ?? 0;
}

/**
 * Conceder ou retirar `owner` é privativo de um owner (ou do admin de sistema).
 * Sem isso, um admin de workspace se promoveria sozinho — e poderia rebaixar
 * quem o promoveu.
 */
export async function updateWorkspaceMemberRoleForCurrentUser(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
) {
  const nextRole = workspaceRoleSchema.parse(role);
  const { session, role: actorRole, isSystemAdmin } =
    await requireWorkspaceRole(workspaceId, "admin");

  if (session.userId === userId && !isSystemAdmin) {
    throw new ConflictError("Você não pode alterar o seu próprio papel.");
  }

  const target = await getWorkspaceMembership(workspaceId, userId);

  if (!target) {
    throw new ResourceNotFoundError(
      "Este usuário não é membro deste espaço de trabalho.",
    );
  }

  if (target.role === nextRole) return;

  const touchesOwner = nextRole === "owner" || target.role === "owner";

  if (touchesOwner && !isSystemAdmin && actorRole !== "owner") {
    throw new AuthorizationError(
      "Apenas um proprietário pode conceder ou retirar o papel de proprietário.",
    );
  }

  if (target.role === "owner" && (await countWorkspaceOwners(workspaceId)) <= 1) {
    throw new ConflictError(
      "Este é o último proprietário do espaço de trabalho. Promova outro membro antes de alterar este papel.",
    );
  }

  await getDb()
    .update(workspaceMembers)
    .set({ role: nextRole })
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
  const { session, role: actorRole, isSystemAdmin } =
    await requireWorkspaceRole(workspaceId, "admin");

  if (session.userId === userId) {
    throw new ConflictError(
      "Você não pode remover a si mesmo do espaço de trabalho.",
    );
  }

  const target = await getWorkspaceMembership(workspaceId, userId);

  if (!target) return;

  if (target.role === "owner") {
    if (!isSystemAdmin && actorRole !== "owner") {
      throw new AuthorizationError(
        "Apenas um proprietário pode remover outro proprietário.",
      );
    }

    if ((await countWorkspaceOwners(workspaceId)) <= 1) {
      throw new ConflictError(
        "Este é o último proprietário do espaço de trabalho e não pode ser removido.",
      );
    }
  }

  await getDb().transaction(async (tx) => {
    // Sair do workspace precisa levar junto o acesso derivado dele: os vínculos
    // de quadro e as atribuições de card sobreviveriam à remoção.
    const workspaceBoardIds = tx
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.workspaceId, workspaceId));

    await tx
      .delete(boardMembers)
      .where(
        and(
          eq(boardMembers.userId, userId),
          inArray(boardMembers.boardId, workspaceBoardIds),
        ),
      );

    await tx
      .delete(cardAssignees)
      .where(
        and(
          eq(cardAssignees.userId, userId),
          inArray(
            cardAssignees.cardId,
            tx
              .select({ id: cards.id })
              .from(cards)
              .where(eq(cards.workspaceId, workspaceId)),
          ),
        ),
      );

    await tx
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      );
  });

  // A sessão em curso continuaria válida por até sete dias; encerrar é o que
  // torna a remoção efetiva de imediato.
  await revokeAllUserSessions(userId);
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

export async function listAssignableMembersForCurrentUser(boardId: string) {
  const { board } = await requireBoardAccess(boardId, "edit");

  return getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, board.workspaceId))
    .orderBy(asc(users.name));
}

export async function isCardAssignee(userId: string, cardId: string) {
  const [row] = await getDb()
    .select({ userId: cardAssignees.userId })
    .from(cardAssignees)
    .where(
      and(eq(cardAssignees.cardId, cardId), eq(cardAssignees.userId, userId)),
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Confirma que o usuário pertence ao workspace do quadro.
 *
 * Sem esta checagem, qualquer UUID de usuário do sistema era aceito como
 * responsável ou membro de quadro — a fronteira entre workspaces ficava aberta
 * a quem conhecesse um id de fora.
 */
async function assertBelongsToWorkspace(workspaceId: string, userId: string) {
  const membership = await getWorkspaceMembership(workspaceId, userId);

  if (!membership) {
    throw new ResourceNotFoundError(
      "Este usuário não pertence a este espaço de trabalho.",
    );
  }
}

export async function assignCardForCurrentUser(cardId: string, userId: string) {
  const { card, board, session } = await requireCardBoardAccess(cardId, "edit");

  await assertBelongsToWorkspace(board.workspaceId, userId);

  const inserted = await getDb()
    .insert(cardAssignees)
    .values({ cardId: card.id, userId, assignedBy: session.userId })
    .onConflictDoNothing()
    .returning({ userId: cardAssignees.userId });

  if (inserted.length === 0) return;

  const [assignee] = await getDb()
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await recordCardEventSafely({
    workspaceId: board.workspaceId,
    boardId: board.id,
    cardId: card.id,
    actorId: session.userId,
    type: CARD_EVENT_TYPES.assigned,
    metadata: { assigneeId: userId, assigneeName: assignee?.name ?? null },
  });
}

export async function unassignCardForCurrentUser(
  cardId: string,
  userId: string,
) {
  const { card, board, session } = await requireCardBoardAccess(cardId, "edit");

  const removed = await getDb()
    .delete(cardAssignees)
    .where(
      and(eq(cardAssignees.cardId, card.id), eq(cardAssignees.userId, userId)),
    )
    .returning({ userId: cardAssignees.userId });

  if (removed.length === 0) return;

  await recordCardEventSafely({
    workspaceId: board.workspaceId,
    boardId: board.id,
    cardId: card.id,
    actorId: session.userId,
    type: CARD_EVENT_TYPES.unassigned,
    metadata: { assigneeId: userId },
  });
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

  await assertBelongsToWorkspace(board.workspaceId, parsed.userId);

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

const boardMemberRoleSchema = z.enum(["manager", "editor", "viewer"]);

/**
 * Um gestor de quadro não pode alterar o próprio papel: seria a mesma
 * escalada de privilégio do nível de workspace, um degrau abaixo. Quem
 * administra o workspace continua podendo, porque não depende deste vínculo
 * para manter o acesso.
 */
function assertNotSelfRoleChange(access: BoardAccessResult, userId: string) {
  const isWorkspaceManager =
    access.session.user.systemRole === "admin" ||
    access.workspaceRole === "owner" ||
    access.workspaceRole === "admin";

  if (access.session.userId === userId && !isWorkspaceManager) {
    throw new ConflictError("Você não pode alterar o seu próprio papel.");
  }
}

export async function updateBoardMemberRoleForCurrentUser(
  boardId: string,
  userId: string,
  role: BoardMemberRole,
) {
  const nextRole = boardMemberRoleSchema.parse(role);
  const access = await requireBoardAccess(boardId, "manage");

  assertNotSelfRoleChange(access, userId);

  await getDb()
    .update(boardMembers)
    .set({ role: nextRole })
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    );
}

export async function removeBoardMemberForCurrentUser(
  boardId: string,
  userId: string,
) {
  const access = await requireBoardAccess(boardId, "manage");

  assertNotSelfRoleChange(access, userId);

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

export async function listIntakeFormsWithStatsForBoard(boardId: string) {
  await requireBoardAccess(boardId, "manage");

  const [forms, counts] = await Promise.all([
    getDb()
      .select()
      .from(intakeForms)
      .where(eq(intakeForms.boardId, boardId))
      .orderBy(asc(intakeForms.name)),
    getDb()
      .select({
        formId: cards.sourceFormId,
        value: sql<number>`count(*)::int`,
      })
      .from(cards)
      .where(
        and(eq(cards.boardId, boardId), isNotNull(cards.sourceFormId)),
      )
      .groupBy(cards.sourceFormId),
  ]);

  const submissionCountByForm = new Map(
    counts.map((row) => [row.formId, row.value]),
  );

  return forms.map((form) => ({
    ...form,
    submissionCount: submissionCountByForm.get(form.id) ?? 0,
  }));
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
      // Texto escrito por uma pessoa, não um modelo: sem isto, qualquer
      // `{{ algo }}` que ela digitasse era apagado da mensagem.
      skipTemplating: true,
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
