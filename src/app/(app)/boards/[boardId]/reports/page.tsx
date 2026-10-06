import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { ReportsLandingView } from "@/app/(app)/boards/[boardId]/reports/reports-landing-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  countAllCardsForBoard,
  getBoardSnapshot,
  getWorkspaceSummary,
  listBoardReports,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardReportsPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  let reports: Awaited<ReturnType<typeof listBoardReports>>;
  let totalCardCount: number;
  try {
    [snapshot, reports, totalCardCount] = await Promise.all([
      getBoardSnapshot(boardId),
      listBoardReports(boardId),
      countAllCardsForBoard(boardId),
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
    <ReportsLandingView
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
      totalCardCount={totalCardCount}
      reports={reports.map((report) => ({
        id: report.id,
        name: report.name,
      }))}
    />
  );
}
