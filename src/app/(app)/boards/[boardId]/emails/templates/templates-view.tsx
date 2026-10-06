"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  createEmailTemplateAction,
  deleteEmailTemplateAction,
  toggleEmailTemplateAction,
  updateEmailTemplateAction,
} from "@/app/(app)/boards/[boardId]/emails/actions";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PipeHeader } from "@/components/app/pipe-header";
import type { AppUserDTO, FormFieldDTO, FormSubmitResult } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export interface EmailTemplateDTO {
  id: string;
  name: string;
  subject: string;
  textBody: string | null;
  isActive: boolean;
}

export interface TemplateCustomFieldDTO {
  key: string;
  label: string;
}

export interface TemplatesViewProps {
  boardId: string;
  boardName: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  templates: EmailTemplateDTO[];
  customFields: TemplateCustomFieldDTO[];
}

function buildTemplateFields(customFields: TemplateCustomFieldDTO[]): FormFieldDTO[] {
  const fixedVariables = "{{card_title}}, {{card_reference}}, {{requester_name}}, {{phase_name}}";
  const fieldVariables = customFields
    .map((field) => `{{campo.${field.key}}} (${field.label})`)
    .join(", ");

  return [
    { type: "text", name: "name", label: "Nome do modelo", required: true },
    {
      type: "text",
      name: "subject",
      label: "Assunto",
      required: true,
      description: "Também aceita as variáveis listadas abaixo.",
    },
    {
      type: "textarea",
      name: "textBody",
      label: "Corpo do e-mail",
      rows: 8,
      required: true,
      description: fieldVariables
        ? `Variáveis do card: ${fixedVariables}. Variáveis dos campos deste quadro: ${fieldVariables}.`
        : `Variáveis do card: ${fixedVariables}.`,
    },
  ];
}

export function TemplatesView({
  boardId,
  boardName,
  workspaceName,
  user,
  signOutAction,
  templates,
  customFields,
}: TemplatesViewProps) {
  const [search, setSearch] = useState("");
  const templateFields = buildTemplateFields(customFields);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editingTemplate = templates.find((template) => template.id === editingId) ?? null;

  async function handleCreate(formData: FormData): Promise<FormSubmitResult> {
    return createEmailTemplateAction(boardId, formData);
  }

  async function handleEdit(formData: FormData): Promise<FormSubmitResult> {
    if (!editingId) return { error: "Selecione um modelo." };
    return updateEmailTemplateAction(boardId, editingId, formData);
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
                Templates de email
              </h1>
              <p className="text-sm text-muted-foreground">
                Modelos reutilizáveis para envios manuais e automações deste pipe.
              </p>
            </div>
            <div className="flex-1" />
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <PlusIcon />
              Novo template
            </Button>
          </div>

          <div className="mt-5 space-y-2.5">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{template.name}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {template.subject}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={template.isActive}
                        onCheckedChange={(checked) =>
                          toggleEmailTemplateAction(boardId, template.id, checked)
                        }
                        aria-label={`Ativar/desativar ${template.name}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {template.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${template.name}`}
                      onClick={() => setEditingId(template.id)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${template.name}`}
                      onClick={() => setDeletingId(template.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {templates.length === 0 && (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Nenhum template criado ainda. Crie um para reutilizar em envios manuais
                e automações.
              </p>
            )}
          </div>
        </div>
      </div>

      <CardFormDialog
        open={creating}
        onOpenChange={setCreating}
        fields={templateFields}
        submitAction={handleCreate}
        title="Novo template de email"
        description="Crie um modelo reutilizável para este pipe."
        submitLabel="Criar template"
      />

      <CardFormDialog
        open={editingId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        fields={templateFields}
        submitAction={handleEdit}
        initialValues={
          editingTemplate
            ? {
                name: editingTemplate.name,
                subject: editingTemplate.subject,
                textBody: editingTemplate.textBody ?? "",
              }
            : {}
        }
        title="Editar template"
        description="Atualize o nome, o assunto ou o corpo deste modelo."
        submitLabel="Salvar alterações"
      />

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        onConfirm={async () => {
          if (deletingId) {
            await deleteEmailTemplateAction(boardId, deletingId);
          }
        }}
        title="Excluir template"
        description="Automações que usam este template deixarão de funcionar."
        confirmLabel="Excluir"
      />
    </div>
  );
}
