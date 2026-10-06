"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AtSignIcon,
  CalendarDaysIcon,
  CheckSquare2Icon,
  ChevronDownSquareIcon,
  CircleDotIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  FileBarChartIcon,
  HashIcon,
  MailPlusIcon,
  PaperclipIcon,
  PencilIcon,
  TypeIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";

import { PipeHeader } from "@/components/app/pipe-header";
import type { AppUserDTO, CustomFieldType } from "@/components/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fieldTypeIcons: Record<CustomFieldType, LucideIcon> = {
  short_text: TypeIcon,
  long_text: TypeIcon,
  number: HashIcon,
  date: CalendarDaysIcon,
  datetime: CalendarDaysIcon,
  checkbox: CheckSquare2Icon,
  select: ChevronDownSquareIcon,
  radio: CircleDotIcon,
  multiselect: ChevronDownSquareIcon,
  email: AtSignIcon,
  phone: TypeIcon,
  url: TypeIcon,
  currency: HashIcon,
  user: UserIcon,
  attachment: PaperclipIcon,
};

type FormStatus = "draft" | "published" | "closed";

const statusLabels: Record<FormStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  closed: "Encerrado",
};

const statusStyles: Record<FormStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-priority-low/10 text-priority-low",
  closed: "bg-priority-urgent/10 text-priority-urgent",
};

export interface FormPreviewFieldDTO {
  id: string;
  label: string;
  type: CustomFieldType;
  isRequired: boolean;
  helpText?: string | null;
}

export interface PrimaryFormDTO {
  id: string;
  name: string;
  description: string | null;
  publicKey: string;
  status: FormStatus;
  submissionCount: number;
  fields: FormPreviewFieldDTO[];
}

export interface FormViewProps {
  boardId: string;
  boardName: string;
  boardColor: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  formCount: number;
  primaryForm: PrimaryFormDTO | null;
}

export function FormView({
  boardId,
  boardName,
  boardColor,
  workspaceName,
  user,
  signOutAction,
  formCount,
  primaryForm,
}: FormViewProps) {
  const [search, setSearch] = useState("");
  const manageHref = `/boards/${boardId}/manage?tab=forms`;
  const publicUrl = primaryForm ? `/f/${primaryForm.publicKey}` : null;

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
        activeTab="formulario"
      />

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--workspace)]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_20rem]">
          {!primaryForm ? (
            <div className="rounded-xl border border-dashed p-10 text-center lg:col-span-2">
              <p className="text-sm font-medium">
                Nenhum formulário criado ainda.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie um formulário para receber solicitações diretamente
                neste fluxo.
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href={manageHref}>Criar formulário</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="h-fit overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate font-heading text-base font-semibold">
                        {primaryForm.name}
                      </h1>
                      <Badge
                        variant="ghost"
                        className={cn(
                          "border-0",
                          statusStyles[primaryForm.status]
                        )}
                      >
                        {statusLabels[primaryForm.status]}
                      </Badge>
                    </div>
                    {primaryForm.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {primaryForm.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {publicUrl && (
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={publicUrl} target="_blank">
                          <ExternalLinkIcon />
                          Visualizar
                        </Link>
                      </Button>
                    )}
                    <Button asChild type="button" size="sm">
                      <Link href={manageHref}>
                        <PencilIcon />
                        Editar
                      </Link>
                    </Button>
                  </div>
                </div>

                <div
                  aria-hidden="true"
                  className="h-28 w-full"
                  style={{
                    background: `linear-gradient(135deg, ${boardColor} 0%, color-mix(in oklch, ${boardColor}, black 40%) 100%)`,
                  }}
                />

                <div className="space-y-5 px-5 py-6">
                  {primaryForm.fields.map((field) => {
                    const Icon = fieldTypeIcons[field.type] ?? TypeIcon;
                    return (
                      <div key={field.id} className="flex items-start gap-3">
                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border text-muted-foreground">
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {field.isRequired && (
                              <span className="text-destructive">*</span>
                            )}
                            {field.label}
                          </p>
                          {field.helpText && (
                            <p className="text-xs text-muted-foreground">
                              {field.helpText}
                            </p>
                          )}
                          <div className="mt-1.5 h-9 w-full rounded-lg border bg-muted/30" />
                        </div>
                      </div>
                    );
                  })}
                  {primaryForm.fields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Este formulário ainda não tem campos.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {primaryForm.submissionCount} solicitaç
                      {primaryForm.submissionCount === 1 ? "ão" : "ões"}
                    </p>
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/boards/${boardId}`}>Ver no pipe</Link>
                    </Button>
                  </div>
                  {formCount > 1 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Este quadro tem {formCount} formulários.{" "}
                      <Link
                        href={manageHref}
                        className="underline underline-offset-2"
                      >
                        Ver todos
                      </Link>
                    </p>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-4">
                  <p className="mb-3 text-sm font-semibold">
                    Próximos passos
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 rounded-lg border border-dashed p-2.5 text-muted-foreground opacity-60">
                      <ClipboardListIcon className="size-4 shrink-0" />
                      <span className="text-xs font-medium">
                        Habilite o rastreio de solicitações
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg border border-dashed p-2.5 text-muted-foreground opacity-60">
                      <MailPlusIcon className="size-4 shrink-0" />
                      <span className="text-xs font-medium">
                        Crie e-mails padronizados
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg border border-dashed p-2.5 text-muted-foreground opacity-60">
                      <FileBarChartIcon className="size-4 shrink-0" />
                      <span className="text-xs font-medium">
                        Analise e exporte relatórios
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
