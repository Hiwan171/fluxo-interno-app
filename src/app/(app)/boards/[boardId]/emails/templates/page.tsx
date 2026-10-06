import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { TemplatesView } from "@/app/(app)/boards/[boardId]/emails/templates/templates-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  getWorkspaceSummary,
  listEmailTemplatesForBoard,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardEmailTemplatesPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  let templates: Awaited<ReturnType<typeof listEmailTemplatesForBoard>>;
  try {
    [snapshot, templates] = await Promise.all([
      getBoardSnapshot(boardId),
      listEmailTemplatesForBoard(boardId),
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

  return (
    <TemplatesView
      boardId={snapshot.board.id}
      boardName={snapshot.board.name}
      workspaceName={workspace.name}
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl,
        role: session.user.systemRole,
      }}
      signOutAction={signOutAction}
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
        subject: template.subject,
        textBody: template.textBody,
        isActive: template.isActive,
      }))}
      customFields={snapshot.customFields.map((field) => ({
        key: field.key,
        label: field.label,
      }))}
    />
  );
}
