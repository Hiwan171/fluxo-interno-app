import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { EmailsView } from "@/app/(app)/boards/[boardId]/emails/emails-view";
import { getAccentForPhaseColor } from "@/components/app/phase-colors";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  getBoardSnapshot,
  getWorkspaceSummary,
  listEmailsForBoard,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardEmailsPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  let emails: Awaited<ReturnType<typeof listEmailsForBoard>>;
  try {
    [snapshot, emails] = await Promise.all([
      getBoardSnapshot(boardId),
      listEmailsForBoard(boardId),
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
    <EmailsView
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
      phases={snapshot.phases.map((phase, index) => ({
        id: phase.id,
        title: phase.name,
        accent: getAccentForPhaseColor(phase.color, index),
      }))}
      emails={emails.map((email) => ({
        id: email.id,
        status: email.status,
        fromAddress: email.fromAddress,
        toAddresses: email.toAddresses,
        subject: email.subject,
        textBody: email.textBody,
        errorMessage: email.errorMessage,
        sentAt: email.sentAt ? email.sentAt.toISOString() : null,
        createdAt: email.createdAt.toISOString(),
        readAt: email.readAt ? email.readAt.toISOString() : null,
        cardId: email.cardId,
        cardReference: `#${email.cardNumber}`,
        cardTitle: email.cardTitle,
        cardPhaseId: email.cardPhaseId,
        requesterName: email.requesterName,
        requesterEmail: email.requesterEmail,
        assigneeUserIds: email.assigneeUserIds,
      }))}
    />
  );
}
