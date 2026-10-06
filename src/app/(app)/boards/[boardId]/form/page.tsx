import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { FormView } from "@/app/(app)/boards/[boardId]/form/form-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  getWorkspaceSummary,
  listFormFieldsForForm,
  listIntakeFormsWithStatsForBoard,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardFormPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  let forms: Awaited<ReturnType<typeof listIntakeFormsWithStatsForBoard>>;
  try {
    [snapshot, forms] = await Promise.all([
      getBoardSnapshot(boardId),
      listIntakeFormsWithStatsForBoard(boardId),
    ]);
  } catch (error) {
    if (
      error instanceof ResourceNotFoundError ||
      error instanceof AuthorizationError
    ) {
      notFound();
    }
    throw error;
  }

  const [session, workspace] = await Promise.all([
    getCurrentSession(),
    getWorkspaceSummary(snapshot.board.workspaceId),
  ]);

  if (!session) {
    notFound();
  }

  const primaryForm =
    forms.find((form) => form.status === "published") ?? forms[0] ?? null;

  const primaryFormFields = primaryForm
    ? await listFormFieldsForForm(primaryForm.id)
    : [];

  return (
    <FormView
      boardId={snapshot.board.id}
      boardName={snapshot.board.name}
      boardColor={snapshot.board.color}
      workspaceName={workspace.name}
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl,
        role: session.user.systemRole,
      }}
      signOutAction={signOutAction}
      formCount={forms.length}
      primaryForm={
        primaryForm
          ? {
              id: primaryForm.id,
              name: primaryForm.name,
              description: primaryForm.description,
              publicKey: primaryForm.publicKey,
              status: primaryForm.status,
              submissionCount: primaryForm.submissionCount,
              fields: primaryFormFields.map((field) => ({
                id: field.id,
                label: field.label,
                type: field.type,
                isRequired: field.isRequired,
                helpText: field.helpText,
              })),
            }
          : null
      }
    />
  );
}
