"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleAlertIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { createReportAction, deleteReportAction } from "@/app/(app)/boards/[boardId]/reports/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PipeHeader } from "@/components/app/pipe-header";
import type { AppUserDTO } from "@/components/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ReportSummaryDTO {
  id: string;
  name: string;
}

export interface ReportsLandingViewProps {
  boardId: string;
  boardName: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  totalCardCount: number;
  reports: ReportSummaryDTO[];
}

function CreateReportDialog({
  boardId,
  open,
  onOpenChange,
}: {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Informe um nome para o relatório.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const reportId = await createReportAction(boardId, name.trim());
      router.push(`/boards/${boardId}/reports/${reportId}`);
    } catch {
      setError("Não foi possível criar o relatório agora.");
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Novo relatório</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar este relatório na lista.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="report-name">Nome</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Chamados em aberto"
              autoFocus
              disabled={pending}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircleIcon className="animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReportsLandingView({
  boardId,
  boardName,
  workspaceName,
  user,
  signOutAction,
  totalCardCount,
  reports,
}: ReportsLandingViewProps) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return reports;
    return reports.filter((report) =>
      report.name.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [reports, search]);

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

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--workspace)]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-lg font-semibold tracking-[-0.01em]">
                Relatórios do Pipe
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie relatórios rápidos e exportáveis com informações de seus
                cards.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar relatórios"
                className="pl-8"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-44 w-56 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <PlusIcon className="size-4" />
              </span>
              <span className="text-sm font-medium">Criar novo relatório</span>
            </button>

            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="group relative flex h-44 w-56 shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-primary/8 p-4 transition-shadow hover:shadow-md"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-0 size-0 border-t-[22px] border-l-[22px] border-t-background border-l-transparent"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Excluir ${report.name}`}
                  className="absolute top-2 right-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => setDeletingId(report.id)}
                >
                  <XIcon />
                </Button>
                <Link
                  href={`/boards/${boardId}/reports/${report.id}`}
                  className="flex h-full flex-col justify-between"
                >
                  <FileTextIcon className="size-4 text-primary" />
                  <div>
                    <p className="font-heading text-2xl font-semibold text-primary">
                      {totalCardCount}
                    </p>
                    <p className="truncate text-sm font-medium">{report.name}</p>
                  </div>
                </Link>
              </div>
            ))}

            {filteredReports.length === 0 && reports.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum relatório encontrado para &quot;{search}&quot;.
              </p>
            )}
          </div>
        </div>
      </div>

      <CreateReportDialog boardId={boardId} open={creating} onOpenChange={setCreating} />

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        onConfirm={async () => {
          if (deletingId) {
            await deleteReportAction(boardId, deletingId);
          }
        }}
        title="Excluir relatório"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
      />
    </div>
  );
}
