"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, Trash2Icon, ZapIcon } from "lucide-react";

import {
  createEmailAutomationAction,
  deleteEmailAutomationAction,
  toggleEmailAutomationAction,
} from "@/app/(app)/boards/[boardId]/emails/actions";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PipeHeader } from "@/components/app/pipe-header";
import type { AppUserDTO, FormFieldDTO, FormSubmitResult } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export interface AutomationDTO {
  id: string;
  name: string;
  triggerPhaseId: string;
  triggerPhaseName: string;
  templateId: string;
  templateName: string;
  recipientType: "requester" | "fixed";
  recipientEmails: string[];
  isActive: boolean;
}

export interface AutomationsViewProps {
  boardId: string;
  boardName: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  phases: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; name: string; isActive: boolean }>;
  automations: AutomationDTO[];
}

export function AutomationsView({
  boardId,
  boardName,
  workspaceName,
  user,
  signOutAction,
  phases,
  templates,
  automations,
}: AutomationsViewProps) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeTemplates = templates.filter((template) => template.isActive);

  const createFields: FormFieldDTO[] = [
    {
      type: "text",
      name: "name",
      label: "Nome da automação",
      required: true,
      placeholder: "Ex.: Avisar cliente ao concluir",
    },
    {
      type: "select",
      name: "triggerPhaseId",
      label: "Quando o card entrar na fase",
      required: true,
      options: phases.map((phase) => ({ label: phase.name, value: phase.id })),
    },
    {
      type: "select",
      name: "templateId",
      label: "Enviar o template",
      required: true,
      description:
        activeTemplates.length === 0
          ? "Crie um template ativo primeiro em Templates de email."
          : undefined,
      options: activeTemplates.map((template) => ({
        label: template.name,
        value: template.id,
      })),
    },
    {
      type: "text",
      name: "recipientEmails",
      label: "Enviar para (e-mails fixos, opcional)",
      placeholder: "ex.: suporteti@empresa.com.br",
      description:
        "Deixe em branco para enviar ao e-mail do solicitante do card. Preencha para avisar sempre um e-mail fixo (ex.: um e-mail da equipe), separados por vírgula para mais de um.",
    },
  ];

  async function handleCreate(formData: FormData): Promise<FormSubmitResult> {
    return createEmailAutomationAction(boardId, formData);
  }

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
        activeTab="emails"
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--workspace)]">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3">
            <Button asChild type="button" variant="ghost" size="icon-sm">
              <Link href={`/boards/${boardId}/emails`}>
                <ArrowLeftIcon />
              </Link>
            </Button>
            <div>
              <h1 className="font-heading text-lg font-semibold tracking-[-0.01em]">
                Automações de email
              </h1>
              <p className="text-sm text-muted-foreground">
                Envie um e-mail automaticamente quando um card entrar em uma fase.
              </p>
            </div>
            <div className="flex-1" />
            <Button
              type="button"
              size="sm"
              onClick={() => setCreating(true)}
              disabled={phases.length === 0 || activeTemplates.length === 0}
            >
              <PlusIcon />
              Nova automação
            </Button>
          </div>

          {activeTemplates.length === 0 && (
            <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Você precisa de pelo menos um{" "}
              <Link
                href={`/boards/${boardId}/emails/templates`}
                className="underline underline-offset-2"
              >
                template de email ativo
              </Link>{" "}
              para criar uma automação.
            </p>
          )}

          <div className="mt-5 space-y-2.5">
            {automations.map((automation) => (
              <div key={automation.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ZapIcon className="size-3.5 shrink-0 text-primary" />
                      <p className="font-medium">{automation.name}</p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      Ao entrar em
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">
                        {automation.triggerPhaseName}
                      </span>
                      <ArrowRightIcon className="size-3" />
                      enviar
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">
                        {automation.templateName}
                      </span>
                      para
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">
                        {automation.recipientType === "fixed"
                          ? automation.recipientEmails.join(", ")
                          : "solicitante do card"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={automation.isActive}
                        onCheckedChange={(checked) =>
                          toggleEmailAutomationAction(boardId, automation.id, checked)
                        }
                        aria-label={`Ativar/desativar ${automation.name}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {automation.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${automation.name}`}
                      onClick={() => setDeletingId(automation.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {automations.length === 0 && (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Nenhuma automação criada ainda.
              </p>
            )}
          </div>
        </div>
      </div>

      <CardFormDialog
        open={creating}
        onOpenChange={setCreating}
        fields={createFields}
        submitAction={handleCreate}
        title="Nova automação de email"
        description="Sempre que um card entrar na fase escolhida, o template é enviado ao solicitante — ou a um e-mail fixo, se configurado."
        submitLabel="Criar automação"
      />

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        onConfirm={async () => {
          if (deletingId) {
            await deleteEmailAutomationAction(boardId, deletingId);
          }
        }}
        title="Excluir automação"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
      />
    </div>
  );
}
