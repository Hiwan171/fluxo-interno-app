"use server";

import { revalidatePath } from "next/cache";

import type { FormSubmitResult } from "@/components/app/types";
import { toCsv } from "@/lib/csv";
import {
  AuthorizationError,
  ConflictError,
  createBoardReportForCurrentUser,
  deleteBoardReportForCurrentUser,
  listCustomFieldsForBoard,
  queryReportCardsForCurrentUser,
  updateBoardReportForCurrentUser,
} from "@/lib/dal";
import {
  REPORT_EXPORT_LIMIT,
  REPORT_PAGE_SIZE,
  type ReportFilter,
  type ReportSortDir,
} from "@/lib/report-query";

export async function createReportAction(boardId: string, name: string) {
  const report = await createBoardReportForCurrentUser({ boardId, name });
  revalidatePath(`/boards/${boardId}/reports`);
  return report.id;
}

export async function deleteReportAction(
  boardId: string,
  reportId: string,
): Promise<FormSubmitResult> {
  try {
    await deleteBoardReportForCurrentUser(reportId);
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ConflictError) {
      return { error: error.message };
    }
    return { error: "Não foi possível excluir o relatório." };
  }

  revalidatePath(`/boards/${boardId}/reports`);
  return { success: true };
}

export async function saveReportAction(
  boardId: string,
  reportId: string,
  input: {
    name?: string;
    filters?: ReportFilter[];
    visibleColumns?: string[];
    sortField?: string;
    sortDir?: ReportSortDir;
  },
): Promise<FormSubmitResult> {
  try {
    await updateBoardReportForCurrentUser(reportId, input);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: "Você não tem permissão para editar este relatório." };
    }
    return { error: "Não foi possível salvar o relatório." };
  }

  revalidatePath(`/boards/${boardId}/reports/${reportId}`);
  revalidatePath(`/boards/${boardId}/reports`);
  return { success: true };
}

export type ReportQueryResult = {
  rows: Array<{
    id: string;
    reference: string;
    title: string;
    status: string;
    priority: string;
    phaseId: string;
    phaseName: string;
    requesterName: string | null;
    requesterEmail: string | null;
    dueAt: string | null;
    createdAt: string;
    createdByName: string | null;
    customFieldValues: Record<string, unknown>;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

/** Uma página do relatório, já filtrada e ordenada pelo banco. */
export async function queryReportCardsAction(
  boardId: string,
  input: {
    filters: ReportFilter[];
    sortField: string;
    sortDir: ReportSortDir;
    page: number;
  },
): Promise<ReportQueryResult> {
  const { rows, total } = await queryReportCardsForCurrentUser(boardId, {
    filters: input.filters,
    sortField: input.sortField,
    sortDir: input.sortDir,
    page: input.page,
    pageSize: REPORT_PAGE_SIZE,
  });

  return {
    total,
    page: input.page,
    pageSize: REPORT_PAGE_SIZE,
    rows: rows.map((row) => ({
      id: row.id,
      reference: `#${row.number}`,
      title: row.title,
      status: row.status,
      priority: row.priority,
      phaseId: row.phaseId,
      phaseName: row.phaseName,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName,
      customFieldValues: row.customFieldValues,
    })),
  };
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";

  if (typeof value === "object") {
    // Anexos são gravados como `{ attachmentIds: [...] }`; na planilha o que
    // interessa é quantos existem, não os identificadores.
    const ids = (value as { attachmentIds?: unknown }).attachmentIds;
    if (Array.isArray(ids)) {
      return ids.length > 0 ? `${ids.length} anexo(s)` : "";
    }
    if (Array.isArray(value)) return value.join("; ");
    return "";
  }

  return String(value);
}

export type ReportExportResult =
  | { error: string }
  | { fileName: string; content: string; truncated: boolean; total: number };

/**
 * Gera o CSV do relatório com os filtros correntes.
 *
 * Devolve o conteúdo como texto para o navegador montar o download: o sandbox
 * do artefato e a própria server action não têm como entregar um arquivo
 * diretamente.
 */
export async function exportReportCsvAction(
  boardId: string,
  reportName: string,
  input: {
    filters: ReportFilter[];
    sortField: string;
    sortDir: ReportSortDir;
    visibleColumns: string[];
  },
): Promise<ReportExportResult> {
  let page: Awaited<ReturnType<typeof queryReportCardsForCurrentUser>>;
  let customFields: Awaited<ReturnType<typeof listCustomFieldsForBoard>>;

  try {
    [page, customFields] = await Promise.all([
      queryReportCardsForCurrentUser(boardId, {
        filters: input.filters,
        sortField: input.sortField,
        sortDir: input.sortDir,
        page: 1,
        pageSize: REPORT_EXPORT_LIMIT,
      }),
      listCustomFieldsForBoard(boardId),
    ]);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: "Você não tem permissão para exportar este relatório." };
    }
    return { error: "Não foi possível gerar a exportação." };
  }

  const fieldById = new Map(customFields.map((field) => [field.id, field]));

  const columns = input.visibleColumns.length > 0
    ? input.visibleColumns
    : ["reference", "title", "phase", "status", "priority", "createdAt"];

  const headerFor = (columnId: string): string => {
    if (columnId.startsWith("custom:")) {
      return fieldById.get(columnId.slice("custom:".length))?.label ?? columnId;
    }

    return (
      {
        reference: "Referência",
        title: "Título",
        phase: "Fase atual",
        status: "Status",
        priority: "Prioridade",
        requesterName: "Solicitante",
        requesterEmail: "E-mail do solicitante",
        createdByName: "Criador",
        dueAt: "Prazo",
        createdAt: "Criado em",
      }[columnId] ?? columnId
    );
  };

  const cellFor = (
    row: (typeof page.rows)[number],
    columnId: string,
  ): unknown => {
    if (columnId.startsWith("custom:")) {
      return formatCsvValue(
        row.customFieldValues[columnId.slice("custom:".length)],
      );
    }

    switch (columnId) {
      case "reference":
        return `#${row.number}`;
      case "title":
        return row.title;
      case "phase":
        return row.phaseName;
      case "status":
        return STATUS_LABELS[row.status] ?? row.status;
      case "priority":
        return PRIORITY_LABELS[row.priority] ?? row.priority;
      case "requesterName":
        return row.requesterName;
      case "requesterEmail":
        return row.requesterEmail;
      case "createdByName":
        return row.createdByName;
      case "dueAt":
        return row.dueAt ? row.dueAt.toLocaleDateString("pt-BR") : "";
      case "createdAt":
        return row.createdAt.toLocaleDateString("pt-BR");
      default:
        return "";
    }
  };

  const content = toCsv(
    columns.map(headerFor),
    page.rows.map((row) => columns.map((columnId) => cellFor(row, columnId))),
  );

  const slug =
    reportName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "relatorio";

  return {
    fileName: `${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
    content,
    truncated: page.total > page.rows.length,
    total: page.total,
  };
}
