import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { AutomationsView } from "@/app/(app)/boards/[boardId]/emails/automations/automations-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  getWorkspaceSummary,
  listEmailAutomationsForBoard,
  listEmailTemplatesForBoard,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardEmailAutomationsPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  let automations: Awaited<ReturnType<typeof listEmailAutomationsForBoard>>;
  let templates: Awaited<ReturnType<typeof listEmailTemplatesForBoard>>;
  try {
    [snapshot, automations, templates] = await Promise.all([
      getBoardSnapshot(boardId),
      listEmailAutomationsForBoard(boardId),
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
    <AutomationsView
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
      phases={snapshot.phases.map((phase) => ({ id: phase.id, name: phase.name }))}
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
        isActive: template.isActive,
      }))}
      automations={automations.map((automation) => ({
        id: automation.id,
        name: automation.name,
        triggerPhaseId: automation.triggerPhaseId,
        triggerPhaseName: automation.triggerPhaseName,
        templateId: automation.templateId,
        templateName: automation.templateName,
        recipientType: automation.recipientType,
        recipientEmails: automation.recipientEmails,
        isActive: automation.isActive,
      }))}
    />
  );
}
