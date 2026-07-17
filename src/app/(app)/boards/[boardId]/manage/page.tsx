import { notFound } from "next/navigation";

import { ManageView } from "@/app/(app)/boards/[boardId]/manage/manage-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  getWorkspaceSummary,
  listBoardMembersForCurrentUser,
  listCustomFieldsForBoard,
  listFormFieldsForForm,
  listIntakeFormsForBoard,
  listWorkspaceMemberOptionsForBoard,
  listWorkspaceMembersForCurrentUser,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function ManageBoardPage({
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

  const workspace = await getWorkspaceSummary(snapshot.board.workspaceId);

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
      boardName={snapshot.board.name}
      workspaceId={snapshot.board.workspaceId}
      workspaceName={workspace.name}
      currentUserId={session.user.id}
      phases={snapshot.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
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
