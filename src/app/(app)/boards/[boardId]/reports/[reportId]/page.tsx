import { notFound } from "next/navigation";

import { signOutAction } from "@/app/(app)/actions";
import { ReportDetailView } from "@/app/(app)/boards/[boardId]/reports/[reportId]/report-detail-view";
import { getCurrentSession } from "@/lib/auth";
import { REPORT_PAGE_SIZE } from "@/lib/report-query";
import {
  AuthorizationError,
  getBoardReportForCurrentUser,
  getBoardSnapshot,
  getWorkspaceSummary,
  listCustomFieldsForBoard,
  queryReportCardsForCurrentUser,
  ResourceNotFoundError,
} from "@/lib/dal";

export default async function BoardReportDetailPage({
  params,
}: {
  params: Promise<{ boardId: string; reportId: string }>;
}) {
  const { boardId, reportId } = await params;

  let snapshot: Awaited<ReturnType<typeof getBoardSnapshot>>;
  let report: Awaited<ReturnType<typeof getBoardReportForCurrentUser>>;
  let firstPage: Awaited<ReturnType<typeof queryReportCardsForCurrentUser>>;
  let customFields: Awaited<ReturnType<typeof listCustomFieldsForBoard>>;
  try {
    report = await getBoardReportForCurrentUser(reportId);

    // A primeira página vem renderizada no servidor; as seguintes chegam por
    // server action conforme o usuário navega ou muda os filtros.
    [snapshot, firstPage, customFields] = await Promise.all([
      getBoardSnapshot(boardId),
      queryReportCardsForCurrentUser(boardId, {
        filters: report.filters,
        sortField: report.sortField,
        sortDir: report.sortDir === "desc" ? "desc" : "asc",
        page: 1,
        pageSize: REPORT_PAGE_SIZE,
      }),
      listCustomFieldsForBoard(boardId),
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

  if (report.boardId !== boardId) {
    notFound();
  }

  const [session, workspace] = await Promise.all([
    getCurrentSession(),
    getWorkspaceSummary(snapshot.board.workspaceId),
  ]);

  if (!session) {
    notFound();
  }

  return (
    <ReportDetailView
      boardId={snapshot.board.id}
      reportId={report.id}
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
      phases={snapshot.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
      }))}
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
      initialTotal={firstPage.total}
      pageSize={REPORT_PAGE_SIZE}
      cards={firstPage.rows.map((card) => ({
        id: card.id,
        reference: `#${card.number}`,
        title: card.title,
        status: card.status as "active" | "completed" | "archived",
        priority: card.priority as "low" | "medium" | "high" | "urgent",
        phaseId: card.phaseId,
        phaseName: card.phaseName,
        requesterName: card.requesterName,
        requesterEmail: card.requesterEmail,
        dueAt: card.dueAt ? card.dueAt.toISOString() : null,
        createdAt: card.createdAt.toISOString(),
        createdByName: card.createdByName,
        customFieldValues: card.customFieldValues,
      }))}
      initialName={report.name}
      initialFilters={report.filters}
      initialVisibleColumns={report.visibleColumns}
      initialSortField={report.sortField}
      initialSortDir={report.sortDir === "desc" ? "desc" : "asc"}
    />
  );
}
