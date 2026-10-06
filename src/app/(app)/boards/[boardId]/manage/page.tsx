import { notFound } from "next/navigation";

import { ManageView } from "@/app/(app)/boards/[boardId]/manage/manage-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  listBoardMembersForCurrentUser,
  listCustomFieldsForBoard,
  listFormFieldsForForm,
  listIntakeFormsForBoard,
  listWorkspaceMemberOptionsForBoard,
  listWorkspaceMembersForCurrentUser,
  ResourceNotFoundError,
} from "@/lib/dal";

const MANAGE_TABS = [
  "formulario",
  "fases",
  "pessoas",
  "email",
  "configuracoes",
] as const;

export default async function ManageBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ tab?: string; phaseId?: string }>;
}) {
  const { boardId } = await params;
  const { tab, phaseId } = await searchParams;

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

  const session = await getCurrentSession();
  if (!session) {
    notFound();
  }

  let boardMembers: Awaited<ReturnType<typeof listBoardMembersForCurrentUser>>;
  let memberOptions: Awaited<
    ReturnType<typeof listWorkspaceMemberOptionsForBoard>
  >;
  let customFields: Awaited<ReturnType<typeof listCustomFieldsForBoard>>;
  let intakeForms: Awaited<ReturnType<typeof listIntakeFormsForBoard>>;
  try {
    [boardMembers, memberOptions, customFields, intakeForms] =
      await Promise.all([
        listBoardMembersForCurrentUser(boardId),
        listWorkspaceMemberOptionsForBoard(boardId),
        listCustomFieldsForBoard(boardId),
        listIntakeFormsForBoard(boardId),
      ]);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      notFound();
    }
    throw error;
  }

  const formFieldsByForm = await Promise.all(
    intakeForms.map((form) => listFormFieldsForForm(form.id)),
  );

  let workspaceMembers: Awaited<
    ReturnType<typeof listWorkspaceMembersForCurrentUser>
  > | null = null;
  try {
    workspaceMembers = await listWorkspaceMembersForCurrentUser(
      snapshot.board.workspaceId,
    );
  } catch (error) {
    if (!(error instanceof AuthorizationError)) {
      throw error;
    }
  }

  return (
    <ManageView
      boardId={boardId}
      workspaceId={snapshot.board.workspaceId}
      boardName={snapshot.board.name}
      boardColor={snapshot.board.color}
      boardDescription={snapshot.board.description}
      boardIcon={snapshot.board.icon}
      boardVisibility={snapshot.board.visibility}
      createCardButtonLabel={snapshot.board.createCardButtonLabel}
      expirationMinutes={snapshot.board.expirationMinutes}
      kanbanVisibleFieldIds={snapshot.board.kanbanVisibleFieldIds}
      onlyAssigneeCanEdit={snapshot.board.onlyAssigneeCanEdit}
      onlyManagerCanDeleteCards={snapshot.board.onlyManagerCanDeleteCards}
      mailFromAddress={process.env.MAIL_FROM ?? "Fluxo Interno <noreply@localhost>"}
      currentUserId={session.user.id}
      initialTab={
        MANAGE_TABS.includes(tab as (typeof MANAGE_TABS)[number])
          ? (tab as (typeof MANAGE_TABS)[number])
          : phaseId
            ? "fases"
            : "formulario"
      }
      initialPhaseId={phaseId ?? null}
      phases={snapshot.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        color: phase.color,
        cardLimit: phase.cardLimit,
      }))}
      boardMembers={boardMembers.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl,
        role: member.role,
      }))}
      memberOptions={memberOptions}
      workspaceMembers={
        workspaceMembers
          ? workspaceMembers.map((member) => ({
              userId: member.userId,
              name: member.name,
              email: member.email,
              avatarUrl: member.avatarUrl,
              role: member.role,
              isActive: member.isActive,
            }))
          : null
      }
      customFields={customFields.map((field) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        type: field.type,
        isRequired: field.isRequired,
        phaseId: field.phaseId,
        options: Array.isArray((field.config as { options?: unknown })?.options)
          ? (field.config as { options: Array<{ label: string; value: string }> })
              .options
          : undefined,
      }))}
      intakeForms={intakeForms.map((form, index) => ({
        id: form.id,
        name: form.name,
        publicKey: form.publicKey,
        status: form.status,
        targetPhaseId: form.targetPhaseId,
        requireRequesterEmail: form.requireRequesterEmail,
        fields: formFieldsByForm[index].map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          targetField: field.targetField,
          customFieldId: field.customFieldId,
          isRequired: field.isRequired,
          position: field.position,
          options: Array.isArray(field.options)
            ? (field.options as Array<{ label: string; value: string }>)
            : [],
        })),
      }))}
    />
  );
}
