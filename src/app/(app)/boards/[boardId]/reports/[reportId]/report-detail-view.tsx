"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  Columns3Icon,
  DownloadIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import {
  exportReportCsvAction,
  queryReportCardsAction,
  saveReportAction,
} from "@/app/(app)/boards/[boardId]/reports/actions";
import { PipeHeader } from "@/components/app/pipe-header";
import type { AppUserDTO, CustomFieldDTO } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CardStatus = "active" | "completed" | "archived";
type CardPriority = "low" | "medium" | "high" | "urgent";

export interface ReportCardRow {
  id: string;
  reference: string;
  title: string;
  status: CardStatus;
  priority: CardPriority;
  phaseId: string;
  phaseName: string;
  requesterName: string | null;
  requesterEmail: string | null;
  dueAt: string | null;
  createdAt: string;
  createdByName: string | null;
  customFieldValues: Record<string, unknown>;
}

export interface SavedFilter {
  fieldId: string;
  value: string;
  valueTo: string;
}

export interface ReportDetailViewProps {
  boardId: string;
  reportId: string;
  boardName: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  phases: Array<{ id: string; name: string }>;
  customFields: CustomFieldDTO[];
  cards: ReportCardRow[];
  initialTotal: number;
  pageSize: number;
  initialName: string;
  initialFilters: SavedFilter[];
  initialVisibleColumns: string[];
  initialSortField: string;
  initialSortDir: "asc" | "desc";
}

const priorityLabels: Record<CardPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const statusLabels: Record<CardStatus, string> = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatCustomFieldValue(
  type: CustomFieldDTO["type"],
  value: unknown,
  options?: Array<{ label: string; value: string }>,
) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "checkbox") return value === true || value === "true" ? "Sim" : "Não";
  if ((type === "select" || type === "radio") && options) {
    return options.find((option) => option.value === value)?.label ?? String(value);
  }
  if (type === "date" || type === "datetime") return formatDate(String(value));
  return String(value);
}

interface ColumnDef {
  id: string;
  label: string;
  group: "Atributos do Card" | "Campos personalizados";
}

type FilterKind = "text" | "select" | "date";

interface FilterableField {
  id: string;
  label: string;
  kind: FilterKind;
  options?: Array<{ label: string; value: string }>;
}

interface FilterRow {
  key: string;
  fieldId: string;
  value: string;
  valueTo: string;
}

const DEFAULT_VISIBLE_COLUMNS = [
  "reference",
  "title",
  "phase",
  "priority",
  "createdByName",
  "createdAt",
];

export function ReportDetailView({
  boardId,
  reportId,
  boardName,
  workspaceName,
  user,
  signOutAction,
  phases,
  customFields,
  cards,
  initialTotal,
  pageSize,
  initialName,
  initialFilters,
  initialVisibleColumns,
  initialSortField,
  initialSortDir,
}: ReportDetailViewProps) {
  const [search, setSearch] = useState("");
  const [name, setName] = useState(initialName);
  const [leftPanel, setLeftPanel] = useState<"filters" | "columns">("filters");
  const [addingFilter, setAddingFilter] = useState(false);
  const [filters, setFilters] = useState<FilterRow[]>(
    initialFilters.map((filter, index) => ({
      key: `${filter.fieldId}-${index}`,
      ...filter,
    })),
  );
  const [columnSearch, setColumnSearch] = useState("");
  const [sortField, setSortField] = useState(initialSortField || "reference");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir || "asc");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // O filtro, a ordenação e a paginação acontecem no banco. A primeira página
  // chega renderizada pelo servidor; as demais vêm por server action. Antes,
  // todos os cards do quadro eram carregados de uma vez e filtrados aqui.
  const [rows, setRows] = useState<ReportCardRow[]>(cards);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const baseColumns: ColumnDef[] = [
    { id: "reference", label: "Código", group: "Atributos do Card" },
    { id: "title", label: "Título", group: "Atributos do Card" },
    { id: "phase", label: "Fase atual", group: "Atributos do Card" },
    { id: "priority", label: "Prioridade", group: "Atributos do Card" },
    { id: "status", label: "Status", group: "Atributos do Card" },
    { id: "requesterName", label: "Solicitante", group: "Atributos do Card" },
    { id: "requesterEmail", label: "E-mail do solicitante", group: "Atributos do Card" },
    { id: "dueAt", label: "Prazo", group: "Atributos do Card" },
    { id: "createdByName", label: "Criador", group: "Atributos do Card" },
    { id: "createdAt", label: "Criado em", group: "Atributos do Card" },
  ];

  const customColumns: ColumnDef[] = customFields.map((field) => ({
    id: `custom:${field.id}`,
    label: field.label,
    group: "Campos personalizados",
  }));

  const allColumns = [...baseColumns, ...customColumns];

  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(
    new Set(
      initialVisibleColumns.length > 0 ? initialVisibleColumns : DEFAULT_VISIBLE_COLUMNS,
    ),
  );

  const filterableFields: FilterableField[] = [
    { id: "title", label: "Título", kind: "text" },
    {
      id: "phase",
      label: "Fase atual",
      kind: "select",
      options: phases.map((phase) => ({ label: phase.name, value: phase.name })),
    },
    {
      id: "priority",
      label: "Prioridade",
      kind: "select",
      options: Object.entries(priorityLabels).map(([value, label]) => ({
        label,
        value,
      })),
    },
    {
      id: "status",
      label: "Status",
      kind: "select",
      options: Object.entries(statusLabels).map(([value, label]) => ({
        label,
        value,
      })),
    },
    { id: "requesterName", label: "Solicitante", kind: "text" },
    { id: "requesterEmail", label: "E-mail do solicitante", kind: "text" },
    { id: "createdByName", label: "Criador", kind: "text" },
    { id: "dueAt", label: "Prazo", kind: "date" },
    { id: "createdAt", label: "Criado em", kind: "date" },
    ...customFields.map((field): FilterableField => {
      if (field.type === "select" || field.type === "radio" || field.type === "multiselect") {
        return {
          id: `custom:${field.id}`,
          label: field.label,
          kind: "select",
          options: field.options,
        };
      }
      if (field.type === "checkbox") {
        return {
          id: `custom:${field.id}`,
          label: field.label,
          kind: "select",
          options: [
            { label: "Sim", value: "true" },
            { label: "Não", value: "false" },
          ],
        };
      }
      if (field.type === "date" || field.type === "datetime") {
        return { id: `custom:${field.id}`, label: field.label, kind: "date" };
      }
      return { id: `custom:${field.id}`, label: field.label, kind: "text" };
    }),
  ];

  function getRawValue(card: ReportCardRow, fieldId: string): unknown {
    switch (fieldId) {
      case "reference":
        return card.reference;
      case "title":
        return card.title;
      case "phase":
        return card.phaseName;
      case "priority":
        return card.priority;
      case "status":
        return card.status;
      case "requesterName":
        return card.requesterName;
      case "requesterEmail":
        return card.requesterEmail;
      case "dueAt":
        return card.dueAt;
      case "createdAt":
        return card.createdAt;
      case "createdByName":
        return card.createdByName;
      default:
        if (fieldId.startsWith("custom:")) {
          return card.customFieldValues[fieldId.slice("custom:".length)];
        }
        return undefined;
    }
  }

  function formatValue(fieldId: string, raw: unknown): string {
    if (raw === null || raw === undefined || raw === "") return "—";
    if (fieldId === "priority") return priorityLabels[raw as CardPriority];
    if (fieldId === "status") return statusLabels[raw as CardStatus];
    if (fieldId === "dueAt" || fieldId === "createdAt") return formatDate(String(raw));
    if (fieldId.startsWith("custom:")) {
      const field = customFields.find((f) => f.id === fieldId.slice("custom:".length));
      if (field) return formatCustomFieldValue(field.type, raw, field.options);
    }
    return String(raw);
  }

  function markDirty() {
    setSaved(false);
  }

  function addFilter(fieldId: string) {
    setFilters((prev) => [
      ...prev,
      { key: `${fieldId}-${Date.now()}`, fieldId, value: "", valueTo: "" },
    ]);
    setAddingFilter(false);
    setPage(1);
    markDirty();
  }

  function updateFilter(key: string, patch: Partial<FilterRow>) {
    setFilters((prev) =>
      prev.map((filter) => (filter.key === key ? { ...filter, ...patch } : filter)),
    );
    // Um filtro novo pode reduzir o total: continuar na página 7 mostraria
    // uma tabela vazia sem explicação.
    setPage(1);
    markDirty();
  }

  function removeFilter(key: string) {
    setFilters((prev) => prev.filter((filter) => filter.key !== key));
    setPage(1);
    markDirty();
  }

  function toggleColumn(id: string) {
    setVisibleColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
    markDirty();
  }

  // Uma chave estável descreve a consulta corrente; o efeito refaz a busca
  // sempre que ela muda, sem depender da identidade dos arrays de filtro.
  const queryKey = JSON.stringify({
    filters: filters.map(({ fieldId, value, valueTo }) => ({
      fieldId,
      value,
      valueTo,
    })),
    sortField,
    sortDir,
    page,
  });

  const isFirstQuery = useRef(true);

  useEffect(() => {
    // A primeira página já veio do servidor; refazer a consulta na montagem
    // seria uma ida ao banco para obter exatamente o que já está na tela.
    if (isFirstQuery.current) {
      isFirstQuery.current = false;
      return;
    }

    const query = JSON.parse(queryKey) as {
      filters: SavedFilter[];
      sortField: string;
      sortDir: "asc" | "desc";
      page: number;
    };

    let cancelled = false;
    setLoading(true);
    setQueryError(null);

    queryReportCardsAction(boardId, query)
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows as ReportCardRow[]);
        setTotal(result.total);
      })
      .catch(() => {
        if (cancelled) return;
        setQueryError("Não foi possível carregar os resultados.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, queryKey]);


  const visibleColumns = allColumns.filter((column) => visibleColumnIds.has(column.id));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageCards = rows;

  function toggleSort(fieldId: string) {
    if (sortField === fieldId) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(fieldId);
      setSortDir("asc");
    }
    setPage(1);
    markDirty();
  }

  /**
   * A exportação é gerada no servidor: o cliente tem apenas a página corrente,
   * então montar o CSV aqui produziria um arquivo com 50 linhas em vez do
   * resultado inteiro do filtro.
   */
  async function handleExportCsv() {
    setExporting(true);
    setQueryError(null);

    try {
      const result = await exportReportCsvAction(boardId, name, {
        filters: filters.map(({ fieldId, value, valueTo }) => ({
          fieldId,
          value,
          valueTo,
        })),
        sortField,
        sortDir,
        visibleColumns: visibleColumns.map((column) => column.id),
      });

      if ("error" in result) {
        setQueryError(result.error);
        return;
      }

      const blob = new Blob([result.content], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);

      if (result.truncated) {
        setQueryError(
          `A exportação foi limitada às primeiras 10.000 linhas de ${result.total}. Refine os filtros para exportar o restante.`,
        );
      }
    } catch {
      setQueryError("Não foi possível gerar a exportação.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveReportAction(boardId, reportId, {
        name: name.trim() || "Novo relatório",
        filters: filters.map(({ fieldId, value, valueTo }) => ({
          fieldId,
          value,
          valueTo,
        })),
        visibleColumns: Array.from(visibleColumnIds),
        sortField,
        sortDir,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const availableFiltersToAdd = filterableFields.filter(
    (field) => !filters.some((filter) => filter.fieldId === field.id),
  );

  const filteredColumnGroups = useMemo(() => {
    const query = columnSearch.trim().toLocaleLowerCase("pt-BR");
    const matches = (label: string) =>
      !query || label.toLocaleLowerCase("pt-BR").includes(query);
    return {
      base: baseColumns.filter((column) => matches(column.label)),
      custom: customColumns.filter((column) => matches(column.label)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnSearch, customFields]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PipeHeader
        boardId={boardId}
        boardName={boardName}
        workspaceName={workspaceName}
        user={user}
        dashboardHref="/"
        signOutAction={signOutAction}
        searchValue={search}
        onSearchChange={setSearch}
        activeTab="relatorios"
      />

      <div className="flex min-h-0 flex-1 bg-[var(--workspace)]">
        <div className="hidden w-72 shrink-0 flex-col border-r bg-background md:flex">
          <div className="flex items-center gap-1.5 px-4 py-3">
            <Button asChild type="button" variant="ghost" size="icon-xs">
              <Link href={`/boards/${boardId}/reports`} aria-label="Voltar para relatórios">
                <ArrowLeftIcon />
              </Link>
            </Button>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                markDirty();
              }}
              className="h-8 border-transparent bg-transparent px-1.5 font-semibold shadow-none focus-visible:border-input"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {leftPanel === "filters" ? (
              <>
                {addingFilter ? (
                  <Select onValueChange={addFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Escolha um campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFiltersToAdd.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setAddingFilter(true)}
                    disabled={availableFiltersToAdd.length === 0}
                  >
                    <PlusIcon />
                    Adicionar filtro
                  </Button>
                )}

                <div className="mt-3 space-y-3">
                  {filters.map((filter) => {
                    const field = filterableFields.find((f) => f.id === filter.fieldId);
                    if (!field) return null;
                    return (
                      <div key={filter.key} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {field.label}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remover filtro ${field.label}`}
                            onClick={() => removeFilter(filter.key)}
                          >
                            <XIcon />
                          </Button>
                        </div>

                        {field.kind === "text" && (
                          <Input
                            className="mt-1.5"
                            placeholder="Contém..."
                            value={filter.value}
                            onChange={(event) =>
                              updateFilter(filter.key, { value: event.target.value })
                            }
                          />
                        )}

                        {field.kind === "select" && (
                          <Select
                            value={filter.value || undefined}
                            onValueChange={(value) => updateFilter(filter.key, { value })}
                          >
                            <SelectTrigger className="mt-1.5 w-full">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {field.kind === "date" && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <Input
                              type="date"
                              value={filter.value}
                              onChange={(event) =>
                                updateFilter(filter.key, { value: event.target.value })
                              }
                            />
                            <span className="text-xs text-muted-foreground">até</span>
                            <Input
                              type="date"
                              value={filter.valueTo}
                              onChange={(event) =>
                                updateFilter(filter.key, { valueTo: event.target.value })
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={columnSearch}
                    onChange={(event) => setColumnSearch(event.target.value)}
                    placeholder="buscar"
                    className="pl-8"
                  />
                </div>

                {filteredColumnGroups.base.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Atributos do Card
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      {filteredColumnGroups.base.map((column) => (
                        <label
                          key={column.id}
                          className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={visibleColumnIds.has(column.id)}
                            onCheckedChange={() => toggleColumn(column.id)}
                          />
                          {column.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {filteredColumnGroups.custom.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Campos personalizados
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      {filteredColumnGroups.custom.map((column) => (
                        <label
                          key={column.id}
                          className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={visibleColumnIds.has(column.id)}
                            onCheckedChange={() => toggleColumn(column.id)}
                          />
                          {column.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t p-4">
            <div className="flex items-center gap-2">
              <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
                {saving && <LoaderCircleIcon className="animate-spin" />}
                Salvar
              </Button>
            </div>
            {saved && (
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                Relatório salvo.
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-background px-5 py-3">
            <p className="flex-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {total} resultado{total === 1 ? "" : "s"}
              </span>{" "}
              — selecione filtros do lado esquerdo, escolha as colunas ou exporte os
              dados usando os botões à direita.
            </p>
            {loading && (
              <span
                role="status"
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                Carregando
              </span>
            )}
            <Button
              type="button"
              variant={leftPanel === "columns" ? "secondary" : "outline"}
              size="icon-sm"
              aria-label="Escolher colunas"
              onClick={() => {
                setLeftPanel((panel) => (panel === "columns" ? "filters" : "columns"));
              }}
            >
              <Columns3Icon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Exportar CSV"
              onClick={handleExportCsv}
              disabled={exporting}
            >
              {exporting ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <DownloadIcon />
              )}
            </Button>
          </div>

          {queryError && (
            <div className="border-b bg-destructive/10 px-5 py-2.5">
              <p className="text-sm text-destructive">{queryError}</p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-background">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  {visibleColumns.map((column) => (
                    <th
                      key={column.id}
                      className="cursor-pointer px-4 py-2.5 text-left font-semibold whitespace-nowrap select-none"
                      onClick={() => toggleSort(column.id)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {column.label}
                        {sortField === column.id &&
                          (sortDir === "asc" ? (
                            <ArrowUpIcon className="size-3" />
                          ) : (
                            <ArrowDownIcon className="size-3" />
                          ))}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageCards.map((card) => (
                  <tr key={card.id} className="border-b hover:bg-muted/30">
                    {visibleColumns.map((column) => (
                      <td key={column.id} className="px-4 py-2.5 whitespace-nowrap">
                        {formatValue(column.id, getRawValue(card, column.id))}
                      </td>
                    ))}
                  </tr>
                ))}
                {pageCards.length === 0 && (
                  <tr>
                    <td
                      colSpan={Math.max(visibleColumns.length, 1)}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Nenhum card encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t bg-background px-5 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .slice(0, 7)
                .map((pageNumber) => (
                  <Button
                    key={pageNumber}
                    type="button"
                    variant={pageNumber === currentPage ? "secondary" : "ghost"}
                    size="icon-xs"
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
              {totalPages > 7 && <span className="px-1">…</span>}
            </div>
            <span>
              {total === 0
                ? "0 de 0"
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} de ${total}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
