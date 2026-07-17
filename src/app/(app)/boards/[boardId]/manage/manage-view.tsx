"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import {
  addBoardMemberAction,
  addFormFieldAction,
  addWorkspaceMemberAction,
  archiveCustomFieldAction,
  createCustomFieldAction,
  createIntakeFormAction,
  deleteFormFieldAction,
  deleteIntakeFormAction,
  moveFormFieldAction,
  removeBoardMemberAction,
  removeWorkspaceMemberAction,
  updateBoardMemberRoleAction,
  updateFormFieldAction,
  updateIntakeFormStatusAction,
  updateWorkspaceMemberRoleAction,
} from "@/app/(app)/boards/[boardId]/manage/actions";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import type { CustomFieldDTO, FormFieldDTO, FormSubmitResult } from "@/components/app/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

interface BoardMemberRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "manager" | "editor" | "viewer";
}

interface WorkspaceMemberRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  isActive: boolean;
}

interface IntakeFormFieldRow {
  id: string;
  label: string;
  type: string;
  targetField: string | null;
  customFieldId: string | null;
  isRequired: boolean;
  position: number;
  options: Array<{ label: string; value: string }>;
}

interface IntakeFormRow {
  id: string;
  name: string;
  publicKey: string;
  status: "draft" | "published" | "closed";
  targetPhaseId: string | null;
  requireRequesterEmail: boolean;
  fields: IntakeFormFieldRow[];
}

export interface ManageViewProps {
  boardId: string;
  boardName: string;
  workspaceId: string;
  workspaceName: string;
  currentUserId: string;
  phases: Array<{ id: string; name: string }>;
  boardMembers: BoardMemberRow[];
  memberOptions: Array<{ userId: string; name: string; email: string }>;
  workspaceMembers: WorkspaceMemberRow[] | null;
  customFields: CustomFieldDTO[];
  intakeForms: IntakeFormRow[];
}

const WORKSPACE_MEMBER_FIELDS: FormFieldDTO[] = [
  { type: "text", name: "name", label: "Nome", required: true },
  { type: "email", name: "email", label: "E-mail", required: true },
  {
    type: "select",
    name: "role",
    label: "Papel",
    options: [
      { label: "Visualizador", value: "viewer" },
      { label: "Membro", value: "member" },
      { label: "Administrador", value: "admin" },
      { label: "Dono", value: "owner" },
    ],
  },
];

const FIELD_TYPE_SELECT_OPTIONS = [
  { label: "Texto curto", value: "short_text" },
  { label: "Texto longo", value: "long_text" },
  { label: "Número", value: "number" },
  { label: "Data", value: "date" },
  { label: "Sim/Não", value: "checkbox" },
  { label: "Lista (seleção única)", value: "select" },
  { label: "E-mail", value: "email" },
];

const CUSTOM_FIELD_FIELDS: FormFieldDTO[] = [
  {
    type: "text",
    name: "label",
    label: "Rótulo",
    required: true,
    placeholder: "Ex.: Centro de custo",
  },
  {
    type: "text",
    name: "key",
    label: "Chave (identificador)",
    required: true,
    placeholder: "ex_centro_custo",
    description: "Letras minúsculas, números e _ apenas.",
  },
  { type: "select", name: "type", label: "Tipo", options: FIELD_TYPE_SELECT_OPTIONS },
  {
    type: "text",
    name: "options",
    label: "Opções da lista (apenas para tipo Lista)",
    placeholder: "Opção A, Opção B, Opção C",
  },
  { type: "checkbox", name: "isRequired", label: "Campo obrigatório" },
];

const EDIT_FORM_FIELD_FIELDS: FormFieldDTO[] = [
  { type: "text", name: "label", label: "Rótulo", required: true },
  {
    type: "text",
    name: "options",
    label: "Opções da lista (se aplicável, separadas por vírgula)",
    placeholder: "Deixe em branco para não alterar",
  },
  { type: "checkbox", name: "isRequired", label: "Obrigatório neste formulário" },
];

const boardRoleLabels: Record<BoardMemberRow["role"], string> = {
  manager: "Gerente",
  editor: "Editor",
  viewer: "Visualizador",
};

const workspaceRoleLabels: Record<WorkspaceMemberRow["role"], string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
  viewer: "Visualizador",
};

const customFieldTypeLabels: Record<string, string> = {
  short_text: "Texto curto",
  long_text: "Texto longo",
  number: "Número",
  date: "Data",
  datetime: "Data e hora",
  checkbox: "Sim/Não",
  select: "Lista",
  multiselect: "Múltipla escolha",
  email: "E-mail",
  phone: "Telefone",
  url: "URL",
  currency: "Moeda",
  user: "Usuário",
};

const formStatusLabels: Record<IntakeFormRow["status"], string> = {
  draft: "Rascunho",
  published: "Publicado",
  closed: "Encerrado",
};

const formStatusStyles: Record<IntakeFormRow["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-priority-low/10 text-priority-low",
  closed: "bg-priority-urgent/10 text-priority-urgent",
};

function fieldBindingLabel(
  field: IntakeFormFieldRow,
  customFields: CustomFieldDTO[],
) {
  if (field.targetField === "title") return "Título do card";
  if (field.targetField === "description") return "Descrição do card";
  if (field.targetField === "requester_name") return "Nome do solicitante";
  if (field.targetField === "requester_email") return "E-mail do solicitante";
  if (field.customFieldId) {
    const match = customFields.find((option) => option.id === field.customFieldId);
    return match ? `Campo do quadro: ${match.label}` : "Campo personalizado";
  }
  return "—";
}

export function ManageView({
  boardId,
  boardName,
  workspaceId,
  workspaceName,
  currentUserId,
  phases,
  boardMembers,
  memberOptions,
  workspaceMembers,
  customFields,
  intakeForms,
}: ManageViewProps) {
  const [addingBoardMember, setAddingBoardMember] = useState(false);
  const [addingWorkspaceMember, setAddingWorkspaceMember] = useState(false);
  const [creatingField, setCreatingField] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);
  const [removingBoardMember, setRemovingBoardMember] = useState<string | null>(
    null,
  );
  const [removingWorkspaceMember, setRemovingWorkspaceMember] = useState<
    string | null
  >(null);
  const [archivingFieldId, setArchivingFieldId] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
  const [managingFormId, setManagingFormId] = useState<string | null>(null);
  const [addingFieldToForm, setAddingFieldToForm] = useState(false);
  const [editingFormFieldId, setEditingFormFieldId] = useState<string | null>(
    null,
  );
  const [deletingFormFieldId, setDeletingFormFieldId] = useState<string | null>(
    null,
  );

  const availableMemberOptions = memberOptions.filter(
    (option) => !boardMembers.some((member) => member.userId === option.userId),
  );

  const boardMemberFields: FormFieldDTO[] = [
    {
      type: "select",
      name: "userId",
      label: "Usuário",
      required: true,
      options: availableMemberOptions.map((option) => ({
        label: `${option.name} (${option.email})`,
        value: option.userId,
      })),
    },
    {
      type: "select",
      name: "role",
      label: "Papel",
      options: [
        { label: "Visualizador", value: "viewer" },
        { label: "Editor", value: "editor" },
        { label: "Gerente", value: "manager" },
      ],
    },
  ];

  async function handleAddBoardMember(formData: FormData): Promise<FormSubmitResult> {
    return addBoardMemberAction(boardId, formData);
  }

  async function handleAddWorkspaceMember(
    formData: FormData,
  ): Promise<FormSubmitResult> {
    return addWorkspaceMemberAction(boardId, workspaceId, formData);
  }

  async function handleCreateField(formData: FormData): Promise<FormSubmitResult> {
    return createCustomFieldAction(boardId, formData);
  }

  const createFormFields: FormFieldDTO[] = [
    { type: "text", name: "name", label: "Nome do formulário", required: true },
    {
      type: "select",
      name: "targetPhaseId",
      label: "Etapa de destino",
      description: "Se não escolher, usa a primeira etapa do quadro.",
      options: phases.map((phase) => ({ label: phase.name, value: phase.id })),
    },
    {
      type: "select",
      name: "status",
      label: "Status",
      options: [
        { label: "Rascunho", value: "draft" },
        { label: "Publicado", value: "published" },
        { label: "Encerrado", value: "closed" },
      ],
    },
    {
      type: "checkbox",
      name: "requireRequesterEmail",
      label: "Exigir e-mail de quem preenche",
    },
  ];

  async function handleCreateForm(formData: FormData): Promise<FormSubmitResult> {
    return createIntakeFormAction(boardId, workspaceId, formData);
  }

  async function handleCopyLink(publicKey: string) {
    const url = `${window.location.origin}/f/${publicKey}`;
    await navigator.clipboard.writeText(url);
    setCopiedFormId(publicKey);
    setTimeout(() => setCopiedFormId(null), 2000);
  }

  const managingForm = intakeForms.find((form) => form.id === managingFormId) ?? null;
  const editingFormField =
    managingForm?.fields.find((field) => field.id === editingFormFieldId) ?? null;

  const addFormFieldFields: FormFieldDTO[] = [
    {
      type: "text",
      name: "label",
      label: "Rótulo",
      required: true,
      placeholder: "Ex.: Categoria",
    },
    {
      type: "select",
      name: "binding",
      label: "Vincular a",
      description: "Onde essa resposta é salva.",
      options: [
        { label: "Novo campo personalizado do quadro", value: "new" },
        { label: "Título do card", value: "title" },
        { label: "Descrição do card", value: "description" },
        { label: "Nome de quem solicita", value: "requester_name" },
        { label: "E-mail de quem solicita", value: "requester_email" },
        ...customFields.map((field) => ({
          label: `Campo existente: ${field.label}`,
          value: `existing:${field.id}`,
        })),
      ],
    },
    {
      type: "select",
      name: "type",
      label: "Tipo (apenas para campo novo)",
      options: FIELD_TYPE_SELECT_OPTIONS,
    },
    {
      type: "text",
      name: "options",
      label: "Opções da lista (apenas tipo Lista)",
      placeholder: "Opção A, Opção B, Opção C",
    },
    { type: "checkbox", name: "isRequired", label: "Campo obrigatório neste formulário" },
  ];

  async function handleAddFormField(formData: FormData): Promise<FormSubmitResult> {
    if (!managingFormId) {
      return { error: "Selecione um formulário." };
    }
    return addFormFieldAction(boardId, managingFormId, formData);
  }

  async function handleEditFormField(formData: FormData): Promise<FormSubmitResult> {
    if (!editingFormFieldId) {
      return { error: "Selecione um campo." };
    }
    return updateFormFieldAction(boardId, editingFormFieldId, formData);
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--workspace)]">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Button asChild type="button" variant="ghost" size="icon-sm">
            <Link href={`/boards/${boardId}`}>
              <ArrowLeftIcon />
            </Link>
          </Button>
          <div>
            <h1 className="font-heading text-lg font-semibold tracking-[-0.01em]">
              Gerenciar {boardName}
            </h1>
            <p className="text-sm text-muted-foreground">{workspaceName}</p>
          </div>
        </div>

        <Tabs defaultValue="board-members">
          <TabsList>
            <TabsTrigger value="board-members">Membros do quadro</TabsTrigger>
            {workspaceMembers && (
              <TabsTrigger value="workspace-members">
                Membros do espaço
              </TabsTrigger>
            )}
            <TabsTrigger value="fields">Campos personalizados</TabsTrigger>
            <TabsTrigger value="forms">Formulários</TabsTrigger>
          </TabsList>

          <TabsContent value="board-members" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => setAddingBoardMember(true)}
                disabled={availableMemberOptions.length === 0}
              >
                <PlusIcon />
                Adicionar membro
              </Button>
            </div>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boardMembers.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar size="sm">
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {member.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            updateBoardMemberRoleAction(
                              boardId,
                              member.userId,
                              value as BoardMemberRow["role"],
                            )
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue>
                              {boardRoleLabels[member.role]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="manager">Gerente</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover ${member.name}`}
                          onClick={() => setRemovingBoardMember(member.userId)}
                        >
                          <Trash2Icon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {boardMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhum membro adicionado ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {workspaceMembers && (
            <TabsContent value="workspace-members" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAddingWorkspaceMember(true)}
                >
                  <PlusIcon />
                  Adicionar membro
                </Button>
              </div>
              <div className="rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspaceMembers.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar size="sm">
                              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {member.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {member.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              updateWorkspaceMemberRoleAction(
                                boardId,
                                workspaceId,
                                member.userId,
                                value as WorkspaceMemberRow["role"],
                              )
                            }
                          >
                            <SelectTrigger size="sm">
                              <SelectValue>
                                {workspaceRoleLabels[member.role]}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Visualizador</SelectItem>
                              <SelectItem value="member">Membro</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="owner">Dono</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {member.userId !== currentUserId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remover ${member.name}`}
                              onClick={() =>
                                setRemovingWorkspaceMember(member.userId)
                              }
                            >
                              <Trash2Icon />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          )}

          <TabsContent value="fields" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => setCreatingField(true)}>
                <PlusIcon />
                Novo campo
              </Button>
            </div>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rótulo</TableHead>
                    <TableHead>Chave</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Obrigatório</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customFields.map((field) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{field.label}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {field.key}
                      </TableCell>
                      <TableCell>{customFieldTypeLabels[field.type]}</TableCell>
                      <TableCell>{field.isRequired ? "Sim" : "Não"}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Arquivar ${field.label}`}
                          onClick={() => setArchivingFieldId(field.id)}
                        >
                          <ArchiveIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {customFields.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum campo personalizado ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="forms" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => setCreatingForm(true)}>
                <PlusIcon />
                Novo formulário
              </Button>
            </div>
            <div className="space-y-3">
              {intakeForms.map((form) => (
                <div key={form.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{form.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        /f/{form.publicKey}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setManagingFormId(form.id)}
                      >
                        <ListIcon />
                        Campos ({form.fields.length})
                      </Button>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          updateIntakeFormStatusAction(
                            boardId,
                            form.id,
                            value as IntakeFormRow["status"],
                          )
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue>
                            <Badge
                              variant="ghost"
                              className={`border-0 ${formStatusStyles[form.status]}`}
                            >
                              {formStatusLabels[form.status]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Rascunho</SelectItem>
                          <SelectItem value="published">Publicado</SelectItem>
                          <SelectItem value="closed">Encerrado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Copiar link público"
                        onClick={() => handleCopyLink(form.publicKey)}
                      >
                        {copiedFormId === form.publicKey ? (
                          <CheckIcon />
                        ) : (
                          <CopyIcon />
                        )}
                      </Button>
                      <Button asChild type="button" variant="outline" size="icon-sm">
                        <Link href={`/f/${form.publicKey}`} target="_blank">
                          <ExternalLinkIcon />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${form.name}`}
                        onClick={() => setDeletingFormId(form.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {intakeForms.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum formulário criado ainda.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet
        open={managingFormId !== null}
        onOpenChange={(open) => {
          if (!open) setManagingFormId(null);
        }}
      >
        <SheetContent side="right" className="w-[min(36rem,100vw)] gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>{managingForm?.name ?? "Campos do formulário"}</SheetTitle>
            <SheetDescription>
              Adicione, edite, reordene ou remova os campos que aparecem para quem
              preenche este formulário.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => setAddingFieldToForm(true)}
              >
                <PlusIcon />
                Adicionar campo
              </Button>
            </div>

            <div className="space-y-2.5">
              {managingForm?.fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {field.label}
                        {field.isRequired && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {fieldBindingLabel(field, customFields)} ·{" "}
                        {customFieldTypeLabels[field.type] ?? field.type}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Mover para cima"
                        disabled={index === 0}
                        onClick={() => moveFormFieldAction(boardId, field.id, "left")}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Mover para baixo"
                        disabled={index === (managingForm?.fields.length ?? 0) - 1}
                        onClick={() => moveFormFieldAction(boardId, field.id, "right")}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Editar ${field.label}`}
                        onClick={() => setEditingFormFieldId(field.id)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Excluir ${field.label}`}
                        onClick={() => setDeletingFormFieldId(field.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {managingForm && managingForm.fields.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhum campo ainda. Adicione o primeiro acima.
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CardFormDialog
        open={addingBoardMember}
        onOpenChange={setAddingBoardMember}
        fields={boardMemberFields}
        submitAction={handleAddBoardMember}
        initialValues={{ role: "viewer" }}
        title="Adicionar membro ao quadro"
        description="Escolha alguém que já faça parte do espaço de trabalho."
        submitLabel="Adicionar"
      />

      <CardFormDialog
        open={addingWorkspaceMember}
        onOpenChange={setAddingWorkspaceMember}
        fields={WORKSPACE_MEMBER_FIELDS}
        submitAction={handleAddWorkspaceMember}
        initialValues={{ role: "member" }}
        title="Adicionar membro ao espaço de trabalho"
        description="Se o e-mail ainda não tiver conta, uma será criada e um acesso é enviado por e-mail."
        submitLabel="Adicionar"
      />

      <CardFormDialog
        open={creatingField}
        onOpenChange={setCreatingField}
        fields={CUSTOM_FIELD_FIELDS}
        submitAction={handleCreateField}
        initialValues={{ type: "short_text" }}
        title="Novo campo personalizado"
        description="Esse campo passa a aparecer nos cards deste quadro."
        submitLabel="Criar campo"
      />

      <CardFormDialog
        open={creatingForm}
        onOpenChange={setCreatingForm}
        fields={createFormFields}
        submitAction={handleCreateForm}
        initialValues={{ status: "draft" }}
        title="Novo formulário"
        description="Cria o formulário com título e descrição. Depois, use “Campos” para personalizar por completo."
        submitLabel="Criar formulário"
      />

      <CardFormDialog
        open={addingFieldToForm}
        onOpenChange={setAddingFieldToForm}
        fields={addFormFieldFields}
        submitAction={handleAddFormField}
        initialValues={{ binding: "new", type: "short_text" }}
        title="Adicionar campo ao formulário"
        description="Crie um campo novo para o quadro ou reaproveite um campo já existente."
        submitLabel="Adicionar campo"
      />

      <CardFormDialog
        open={editingFormFieldId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingFormFieldId(null);
        }}
        fields={EDIT_FORM_FIELD_FIELDS}
        submitAction={handleEditFormField}
        initialValues={
          editingFormField
            ? {
                label: editingFormField.label,
                isRequired: editingFormField.isRequired,
              }
            : {}
        }
        title="Editar campo"
        description="Atualize o rótulo, as opções ou a obrigatoriedade deste campo."
        submitLabel="Salvar alterações"
      />

      <ConfirmDialog
        open={removingBoardMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingBoardMember(null);
        }}
        onConfirm={async () => {
          if (removingBoardMember) {
            await removeBoardMemberAction(boardId, removingBoardMember);
          }
        }}
        title="Remover membro do quadro"
        description="Esta pessoa perde o acesso a este quadro específico."
        confirmLabel="Remover"
      />

      <ConfirmDialog
        open={removingWorkspaceMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingWorkspaceMember(null);
        }}
        onConfirm={async () => {
          if (removingWorkspaceMember) {
            await removeWorkspaceMemberAction(
              boardId,
              workspaceId,
              removingWorkspaceMember,
            );
          }
        }}
        title="Remover membro do espaço de trabalho"
        description="Esta pessoa perde o acesso a todos os quadros deste espaço de trabalho."
        confirmLabel="Remover"
      />

      <ConfirmDialog
        open={archivingFieldId !== null}
        onOpenChange={(open) => {
          if (!open) setArchivingFieldId(null);
        }}
        onConfirm={async () => {
          if (archivingFieldId) {
            await archiveCustomFieldAction(boardId, archivingFieldId);
          }
        }}
        title="Arquivar campo"
        description="O campo deixa de aparecer nos cards, mas os valores já preenchidos são mantidos."
        confirmLabel="Arquivar"
      />

      <ConfirmDialog
        open={deletingFormId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingFormId(null);
        }}
        onConfirm={async () => {
          if (deletingFormId) {
            await deleteIntakeFormAction(boardId, deletingFormId);
          }
        }}
        title="Excluir formulário"
        description="O link público deixa de funcionar imediatamente."
        confirmLabel="Excluir"
      />

      <ConfirmDialog
        open={deletingFormFieldId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingFormFieldId(null);
        }}
        onConfirm={async () => {
          if (deletingFormFieldId) {
            await deleteFormFieldAction(boardId, deletingFormFieldId);
          }
        }}
        title="Excluir campo do formulário"
        description="O campo deixa de aparecer neste formulário. Valores já salvos em cards existentes são mantidos."
        confirmLabel="Excluir"
      />
    </div>
  );
}
