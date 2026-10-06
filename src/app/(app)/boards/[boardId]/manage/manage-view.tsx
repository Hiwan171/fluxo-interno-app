"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlignLeftIcon,
  ArchiveIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  AtSignIcon,
  CalendarCheck2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CheckIcon,
  CheckSquare2Icon,
  ChevronDownSquareIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  ClockIcon,
  CopyIcon,
  DollarSignIcon,
  ExternalLinkIcon,
  FileIcon,
  HashIcon,
  IdCardIcon,
  LoaderCircleIcon,
  MailIcon,
  PaperclipIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  KeyRoundIcon,
  Trash2Icon,
  TypeIcon,
  UserIcon,
} from "lucide-react";

import {
  createPhaseAction,
  deletePhaseAction,
  movePhaseAction,
  updatePhaseAction,
} from "@/app/(app)/boards/[boardId]/actions";
import {
  addBoardMemberAction,
  addFormFieldAction,
  addWorkspaceMemberAction,
  archiveCustomFieldAction,
  createCustomFieldAction,
  createIntakeFormAction,
  createPhaseFieldAction,
  deleteFormFieldAction,
  deleteIntakeFormAction,
  moveFormFieldAction,
  removeBoardMemberAction,
  removeWorkspaceMemberAction,
  sendPasswordResetAction,
  updateBoardAction,
  updateBoardMemberRoleAction,
  updateFormFieldAction,
  updateIntakeFormStatusAction,
  updateWorkspaceMemberRoleAction,
} from "@/app/(app)/boards/[boardId]/manage/actions";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DynamicFormField } from "@/components/app/dynamic-form-field";
import { PHASE_COLOR_PALETTE } from "@/components/app/phase-colors";
import { ICON_PALETTE } from "@/components/app/phase-icons";
import type {
  CustomFieldDTO,
  FormFieldDTO,
  FormSubmitResult,
} from "@/components/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

interface PhaseRow {
  id: string;
  name: string;
  color: string | null;
  cardLimit: number | null;
}

export type ManageTab =
  | "formulario"
  | "fases"
  | "pessoas"
  | "email"
  | "configuracoes";

export interface ManageViewProps {
  boardId: string;
  workspaceId: string;
  boardName: string;
  boardColor: string;
  boardDescription: string | null;
  boardIcon: string | null;
  boardVisibility: "workspace" | "private";
  createCardButtonLabel: string | null;
  expirationMinutes: number | null;
  kanbanVisibleFieldIds: string[];
  onlyAssigneeCanEdit: boolean;
  onlyManagerCanDeleteCards: boolean;
  mailFromAddress: string;
  currentUserId: string;
  initialTab: ManageTab;
  initialPhaseId?: string | null;
  phases: PhaseRow[];
  boardMembers: BoardMemberRow[];
  memberOptions: Array<{ userId: string; name: string; email: string }>;
  workspaceMembers: WorkspaceMemberRow[] | null;
  customFields: CustomFieldDTO[];
  intakeForms: IntakeFormRow[];
}

const FIELD_TYPE_SELECT_OPTIONS = [
  { label: "Texto curto", value: "short_text" },
  { label: "Texto longo", value: "long_text" },
  { label: "Número", value: "number" },
  { label: "Data", value: "date" },
  { label: "Data e hora", value: "datetime" },
  { label: "Sim/Não", value: "checkbox" },
  { label: "Lista (seleção única)", value: "select" },
  { label: "Múltipla escolha (radio)", value: "radio" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "Moeda", value: "currency" },
  { label: "Anexo", value: "attachment" },
];

/**
 * Mirrors Pipefy's full "Tipos de campo" palette. Entries without `type`
 * have no backing field type yet (dynamic content, tags, assignee picker,
 * time-only, documents, auto id) — shown for visual parity but left
 * disabled instead of silently creating a broken field.
 */
const FIELD_TYPE_PALETTE: Array<{
  label: string;
  icon: typeof TypeIcon;
  type?: string;
}> = [
  { label: "Texto curto", icon: TypeIcon, type: "short_text" },
  { label: "Texto longo", icon: AlignLeftIcon, type: "long_text" },
  { label: "Conteúdo dinâmico", icon: SparklesIcon },
  { label: "Anexo", icon: PaperclipIcon, type: "attachment" },
  { label: "Checkbox", icon: CheckSquare2Icon, type: "checkbox" },
  { label: "Responsável", icon: UserIcon },
  { label: "Data", icon: CalendarDaysIcon, type: "date" },
  { label: "Data e hora", icon: CalendarClockIcon, type: "datetime" },
  { label: "Data de vencimento", icon: CalendarCheck2Icon, type: "date" },
  { label: "Etiquetas", icon: TagIcon },
  { label: "Email", icon: AtSignIcon, type: "email" },
  { label: "Número de telefone", icon: PhoneIcon, type: "phone" },
  { label: "Seleção de lista", icon: ChevronDownSquareIcon, type: "select" },
  { label: "Seleção de única opção", icon: CircleDotIcon, type: "radio" },
  { label: "Tempo", icon: ClockIcon },
  { label: "Numérico", icon: HashIcon, type: "number" },
  { label: "Moeda", icon: DollarSignIcon, type: "currency" },
  { label: "Documentos", icon: FileIcon },
  { label: "ID", icon: IdCardIcon },
];

function FieldTypePalette({
  interactive,
  onSelect,
}: {
  interactive: boolean;
  onSelect?: (type: string) => void;
}) {
  return (
    <div className="shrink-0 border-b p-4 lg:h-full lg:w-52 lg:overflow-y-auto lg:border-r lg:border-b-0">
      <p className="text-sm font-semibold">Tipos de campo</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {interactive
          ? "Clique em um campo para adicioná-lo ao formulário."
          : "Clique ou arraste os campos para construir o seu formulário."}
      </p>
      <div className="mt-3 space-y-2">
        {FIELD_TYPE_PALETTE.map(({ label, icon: Icon, type }) => {
          const enabled = interactive && Boolean(type);
          return (
            <button
              key={label}
              type="button"
              disabled={!enabled}
              onClick={() => type && onSelect?.(type)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors",
                enabled
                  ? "hover:border-primary/40 hover:bg-primary/5"
                  : "cursor-not-allowed text-muted-foreground opacity-60",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const fieldTypeIcons: Record<string, typeof TypeIcon> = {
  short_text: TypeIcon,
  long_text: AlignLeftIcon,
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
    label: "Opções da lista (apenas para tipo Lista ou Radio)",
    placeholder: "Opção A, Opção B, Opção C",
  },
  { type: "checkbox", name: "isRequired", label: "Campo obrigatório" },
];

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
  radio: "Seleção única (radio)",
  multiselect: "Múltipla escolha",
  email: "E-mail",
  phone: "Telefone",
  url: "URL",
  currency: "Moeda",
  user: "Usuário",
  attachment: "Anexo",
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
  workspaceId,
  boardName,
  boardColor,
  boardDescription,
  boardIcon,
  boardVisibility,
  createCardButtonLabel,
  expirationMinutes,
  kanbanVisibleFieldIds,
  onlyAssigneeCanEdit,
  onlyManagerCanDeleteCards,
  mailFromAddress,
  currentUserId,
  initialTab,
  initialPhaseId,
  phases,
  boardMembers,
  memberOptions,
  workspaceMembers,
  customFields,
  intakeForms,
}: ManageViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ManageTab>(initialTab);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(
    intakeForms[0]?.id ?? null,
  );
  const [creatingForm, setCreatingForm] = useState(false);
  const [addingFieldToForm, setAddingFieldToForm] = useState(false);
  const [paletteFieldType, setPaletteFieldType] = useState<string | null>(null);
  const [editingFormFieldId, setEditingFormFieldId] = useState<string | null>(
    null,
  );
  const [deletingFormFieldId, setDeletingFormFieldId] = useState<string | null>(
    null,
  );
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);

  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(
    initialPhaseId ?? phases[0]?.id ?? null,
  );
  const [creatingPhase, setCreatingPhase] = useState(false);
  const [deletingPhaseId, setDeletingPhaseId] = useState<string | null>(null);
  const [savingPhase, setSavingPhase] = useState(false);
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [editingPhaseSettings, setEditingPhaseSettings] = useState(false);
  const [addingPhaseField, setAddingPhaseField] = useState(false);
  const [palettePhaseFieldType, setPalettePhaseFieldType] = useState<
    string | null
  >(null);
  const [archivingPhaseFieldId, setArchivingPhaseFieldId] = useState<
    string | null
  >(null);

  const [addingBoardMember, setAddingBoardMember] = useState(false);
  const [addingWorkspaceMember, setAddingWorkspaceMember] = useState(false);
  const [removingBoardMember, setRemovingBoardMember] = useState<string | null>(
    null,
  );
  const [removingWorkspaceMember, setRemovingWorkspaceMember] = useState<
    string | null
  >(null);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleNotice, setPeopleNotice] = useState<string | null>(null);

  const [creatingField, setCreatingField] = useState(false);
  const [archivingFieldId, setArchivingFieldId] = useState<string | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardSaved, setBoardSaved] = useState(false);

  function closeDialog() {
    router.push(`/boards/${boardId}`);
  }

  const selectedForm =
    intakeForms.find((form) => form.id === selectedFormId) ??
    intakeForms[0] ??
    null;
  const selectedPhase =
    phases.find((phase) => phase.id === selectedPhaseId) ?? phases[0] ?? null;
  const selectedPhaseIndex = selectedPhase
    ? phases.findIndex((phase) => phase.id === selectedPhase.id)
    : -1;
  const selectedPhaseFields = selectedPhase
    ? customFields.filter((field) => field.phaseId === selectedPhase.id)
    : [];

  const editingFormField =
    selectedForm?.fields.find((field) => field.id === editingFormFieldId) ??
    null;

  const filteredBoardMembers = useMemo(() => {
    const query = peopleSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return boardMembers;
    return boardMembers.filter((member) =>
      `${member.name} ${member.email}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [boardMembers, peopleSearch]);

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

  async function handleCreateForm(formData: FormData): Promise<FormSubmitResult> {
    return createIntakeFormAction(boardId, workspaceId, formData);
  }

  async function handleAddFormField(formData: FormData): Promise<FormSubmitResult> {
    if (!selectedForm) {
      return { error: "Selecione um formulário." };
    }
    return addFormFieldAction(boardId, selectedForm.id, formData);
  }

  async function handleEditFormField(formData: FormData): Promise<FormSubmitResult> {
    if (!editingFormFieldId) {
      return { error: "Selecione um campo." };
    }
    return updateFormFieldAction(boardId, editingFormFieldId, formData);
  }

  async function handleCopyLink(publicKey: string) {
    const url = `${window.location.origin}/f/${publicKey}`;
    await navigator.clipboard.writeText(url);
    setCopiedFormId(publicKey);
    setTimeout(() => setCopiedFormId(null), 2000);
  }

  async function handleCreatePhase(formData: FormData): Promise<FormSubmitResult> {
    const result = await createPhaseAction(boardId, formData);
    if (result.success) router.refresh();
    return result;
  }

  async function handleMovePhase(direction: "left" | "right") {
    if (!selectedPhase) return;
    await movePhaseAction(boardId, selectedPhase.id, direction);
    router.refresh();
  }

  async function handleDeletePhase() {
    if (!deletingPhaseId) return;
    await deletePhaseAction(boardId, deletingPhaseId);
    if (deletingPhaseId === selectedPhaseId) setSelectedPhaseId(null);
    setDeletingPhaseId(null);
    router.refresh();
  }

  async function handleUpdatePhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPhase) return;

    setSavingPhase(true);
    setPhaseError(null);
    const formData = new FormData(event.currentTarget);
    const result = await updatePhaseAction(boardId, selectedPhase.id, formData);
    if (result?.error) {
      setPhaseError(result.error);
    } else {
      router.refresh();
    }
    setSavingPhase(false);
  }

  async function handleAddPhaseField(formData: FormData): Promise<FormSubmitResult> {
    if (!selectedPhase) {
      return { error: "Selecione uma fase." };
    }
    return createPhaseFieldAction(boardId, selectedPhase.id, formData);
  }

  async function handleUpdateBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBoard(true);
    setBoardError(null);
    setBoardSaved(false);
    const formData = new FormData(event.currentTarget);
    const result = await updateBoardAction(boardId, formData);
    if (result?.error) {
      setBoardError(result.error);
    } else {
      setBoardSaved(true);
    }
    setSavingBoard(false);
  }

  /**
   * As guardas de papel do servidor recusam alterações inválidas — último
   * proprietário, mudança do próprio papel. Sem isto o Select mostraria o valor
   * novo enquanto o servidor manteve o antigo; o refresh devolve a verdade.
   */
  async function handleRoleChange(
    run: () => Promise<FormSubmitResult>,
  ): Promise<void> {
    setPeopleError(null);
    setPeopleNotice(null);

    const result = await run();

    if (result?.error) {
      setPeopleError(result.error);
    }

    router.refresh();
  }

  async function handleSendPasswordReset(userId: string): Promise<void> {
    setPeopleError(null);
    setPeopleNotice(null);

    const result = await sendPasswordResetAction(workspaceId, userId);

    if (result?.error) {
      setPeopleError(result.error);
      return;
    }

    setPeopleNotice(
      "Link de redefinição enviado. Ele vale por 2 horas e só pode ser usado uma vez.",
    );
  }

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

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent className="flex h-[85vh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-4xl">
        <div className="flex items-center gap-3 border-b px-5 py-4 pr-14">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <SparklesIcon className="size-4" />
          </span>
          <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">
            Configurações - {boardName}
          </DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Gerencie o formulário inicial, as fases, as pessoas, os e-mails e as
          configurações deste pipe.
        </DialogDescription>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ManageTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList
            variant="line"
            className="h-11 shrink-0 justify-start gap-4 border-b px-5"
          >
            <TabsTrigger value="formulario">Formulário inicial</TabsTrigger>
            <TabsTrigger value="fases">Fases</TabsTrigger>
            <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações do pipe</TabsTrigger>
          </TabsList>

          {/* Formulário inicial */}
          <TabsContent value="formulario" className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[13rem_1fr]">
              <FieldTypePalette
                interactive={Boolean(selectedForm)}
                onSelect={(type) => {
                  setPaletteFieldType(type);
                  setAddingFieldToForm(true);
                }}
              />

              <div className="p-5">
                {!selectedForm ? (
                  <div className="rounded-xl border border-dashed p-10 text-center">
                    <p className="text-sm font-medium">
                      Nenhum formulário criado ainda.
                    </p>
                    <Button
                      className="mt-4"
                      size="sm"
                      onClick={() => setCreatingForm(true)}
                    >
                      <PlusIcon />
                      Criar formulário
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {intakeForms.length > 1 ? (
                        <Select value={selectedForm.id} onValueChange={setSelectedFormId}>
                          <SelectTrigger className="w-fit border-0 bg-transparent px-0 text-lg font-semibold shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {intakeForms.map((form) => (
                              <SelectItem key={form.id} value={form.id}>
                                {form.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <h3 className="text-lg font-semibold">{selectedForm.name}</h3>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="cursor-not-allowed opacity-60">
                          Condicionais em campos
                        </span>
                        <span className="cursor-not-allowed opacity-60">
                          Opções Avançadas
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select
                        value={selectedForm.status}
                        onValueChange={(value) =>
                          updateIntakeFormStatusAction(
                            boardId,
                            selectedForm.id,
                            value as IntakeFormRow["status"],
                          )
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue>
                            <Badge
                              variant="ghost"
                              className={cn(
                                "border-0",
                                formStatusStyles[selectedForm.status],
                              )}
                            >
                              {formStatusLabels[selectedForm.status]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Rascunho</SelectItem>
                          <SelectItem value="published">Publicado</SelectItem>
                          <SelectItem value="closed">Encerrado</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="font-mono text-xs text-muted-foreground">
                        /f/{selectedForm.publicKey}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Copiar link público"
                        onClick={() => handleCopyLink(selectedForm.publicKey)}
                      >
                        {copiedFormId === selectedForm.publicKey ? (
                          <CheckIcon />
                        ) : (
                          <CopyIcon />
                        )}
                      </Button>
                      <Button asChild type="button" variant="outline" size="icon-sm">
                        <Link href={`/f/${selectedForm.publicKey}`} target="_blank">
                          <ExternalLinkIcon />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${selectedForm.name}`}
                        onClick={() => setDeletingFormId(selectedForm.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      {selectedForm.fields.map((field, index) => {
                        const Icon = fieldTypeIcons[field.type] ?? TypeIcon;
                        return (
                          <div
                            key={field.id}
                            className="flex items-center gap-3 rounded-lg border p-3"
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-md border text-muted-foreground">
                              <Icon className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
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
                                onClick={() =>
                                  moveFormFieldAction(boardId, field.id, "left")
                                }
                              >
                                <ArrowUpIcon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Mover para baixo"
                                disabled={index === selectedForm.fields.length - 1}
                                onClick={() =>
                                  moveFormFieldAction(boardId, field.id, "right")
                                }
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
                        );
                      })}
                      {selectedForm.fields.length === 0 && (
                        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                          Nenhum campo ainda. Adicione o primeiro abaixo.
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setPaletteFieldType(null);
                          setAddingFieldToForm(true);
                        }}
                      >
                        <PlusIcon />
                        Adicionar campo
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCreatingForm(true)}
                      >
                        <PlusIcon />
                        Novo formulário
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Fases */}
          <TabsContent value="fases" className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[13rem_1fr]">
              <FieldTypePalette
                interactive={Boolean(selectedPhase)}
                onSelect={(type) => {
                  setPalettePhaseFieldType(type);
                  setAddingPhaseField(true);
                }}
              />

              <div className="p-5">
                {!selectedPhase ? (
                  <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    Nenhuma fase criada ainda.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1">
                      <Select value={selectedPhase.id} onValueChange={setSelectedPhaseId}>
                        <SelectTrigger
                          className="w-fit gap-1.5 rounded-full border-0 px-3 text-sm font-semibold shadow-none"
                          style={{
                            backgroundColor: `${selectedPhase.color ?? "#71717a"}1a`,
                            color: selectedPhase.color ?? undefined,
                          }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {phases.map((phase) => (
                            <SelectItem key={phase.id} value={phase.id}>
                              {phase.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar nome, cor e limite da fase"
                        onClick={() => setEditingPhaseSettings((value) => !value)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Mover fase para a esquerda"
                        disabled={selectedPhaseIndex <= 0}
                        onClick={() => handleMovePhase("left")}
                      >
                        <ArrowLeftIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Mover fase para a direita"
                        disabled={selectedPhaseIndex === -1 || selectedPhaseIndex >= phases.length - 1}
                        onClick={() => handleMovePhase("right")}
                      >
                        <ArrowRightIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir fase ${selectedPhase.name}`}
                        onClick={() => setDeletingPhaseId(selectedPhase.id)}
                      >
                        <Trash2Icon />
                      </Button>
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCreatingPhase(true)}
                      >
                        <PlusIcon />
                        Nova fase
                      </Button>
                    </div>

                    {editingPhaseSettings && (
                      <form
                        key={selectedPhase.id}
                        onSubmit={handleUpdatePhase}
                        className="mt-4 max-w-sm space-y-4 rounded-xl border bg-card p-4"
                      >
                        {phaseError && (
                          <Alert variant="destructive">
                            <CircleAlertIcon />
                            <AlertDescription>{phaseError}</AlertDescription>
                          </Alert>
                        )}
                        <div className="space-y-1.5">
                          <Label htmlFor="phase-name">Nome da fase</Label>
                          <Input
                            id="phase-name"
                            name="name"
                            defaultValue={selectedPhase.name}
                            required
                          />
                        </div>
                        <DynamicFormField
                          field={{
                            type: "color",
                            name: "color",
                            label: "Cor",
                            options: PHASE_COLOR_PALETTE.map((option) => ({
                              label: option.label,
                              value: option.value,
                            })),
                          }}
                          initialValue={selectedPhase.color ?? undefined}
                        />
                        <div className="space-y-1.5">
                          <Label htmlFor="phase-limit">Limite de cards (opcional)</Label>
                          <Input
                            id="phase-limit"
                            name="cardLimit"
                            type="number"
                            min={1}
                            defaultValue={selectedPhase.cardLimit ?? ""}
                          />
                        </div>
                        <Button type="submit" size="sm" disabled={savingPhase}>
                          {savingPhase && <LoaderCircleIcon className="animate-spin" />}
                          Salvar
                        </Button>
                      </form>
                    )}

                    <div className="mt-4 max-w-xl rounded-xl border bg-card p-5">
                      <p className="text-xs text-muted-foreground">Fase atual</p>
                      <p
                        className="mt-1 inline-block rounded-md px-2 py-1 text-sm font-semibold"
                        style={{
                          backgroundColor: `${selectedPhase.color ?? "#71717a"}1a`,
                          color: selectedPhase.color ?? undefined,
                        }}
                      >
                        {selectedPhase.name}
                      </p>

                      {selectedPhaseFields.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Nenhum campo específico desta fase ainda. Clique num
                          tipo de campo à esquerda para adicionar.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-2.5">
                          {selectedPhaseFields.map((field) => {
                            const Icon = fieldTypeIcons[field.type] ?? TypeIcon;
                            return (
                              <div
                                key={field.id}
                                className="flex items-center gap-3 rounded-lg border p-3"
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md border text-muted-foreground">
                                  <Icon className="size-3.5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">
                                    {field.label}
                                    {field.isRequired && (
                                      <span className="ml-1 text-destructive">*</span>
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {customFieldTypeLabels[field.type] ?? field.type}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Arquivar ${field.label}`}
                                  onClick={() => setArchivingPhaseFieldId(field.id)}
                                >
                                  <ArchiveIcon />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Pessoas */}
          <TabsContent value="pessoas" className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">
                {boardMembers.length} pessoas em {boardName}
              </h3>
              <Button
                type="button"
                size="sm"
                onClick={() => setAddingBoardMember(true)}
                disabled={availableMemberOptions.length === 0}
              >
                <PlusIcon />
                Convidar pessoas
              </Button>
            </div>

            {peopleError && (
              <Alert variant="destructive" className="mt-4">
                <CircleAlertIcon />
                <AlertDescription>{peopleError}</AlertDescription>
              </Alert>
            )}

            {peopleNotice && (
              <Alert className="mt-4">
                <CircleCheckIcon />
                <AlertDescription>{peopleNotice}</AlertDescription>
              </Alert>
            )}

            <div className="relative mt-4 w-72">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={peopleSearch}
                onChange={(event) => setPeopleSearch(event.target.value)}
                placeholder="Pesquisar por nome"
                className="pl-8"
              />
            </div>

            <div className="mt-3 rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoardMembers.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar size="sm">
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                              {member.name}
                              {member.userId === currentUserId && (
                                <Badge variant="secondary" className="font-normal">
                                  Esse é você!
                                </Badge>
                              )}
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
                            handleRoleChange(() =>
                              updateBoardMemberRoleAction(
                                boardId,
                                member.userId,
                                value as BoardMemberRow["role"],
                              ),
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
                  {filteredBoardMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhuma pessoa encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {workspaceMembers && (
              <div className="mt-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    Membros do espaço de trabalho
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAddingWorkspaceMember(true)}
                  >
                    <PlusIcon />
                    Adicionar membro
                  </Button>
                </div>
                <div className="mt-3 rounded-xl border bg-card">
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
                                handleRoleChange(() =>
                                  updateWorkspaceMemberRoleAction(
                                    boardId,
                                    workspaceId,
                                    member.userId,
                                    value as WorkspaceMemberRow["role"],
                                  ),
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
                            <div className="flex items-center justify-end gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Enviar link de redefinição de senha para ${member.name}`}
                                title="Enviar link de redefinição de senha"
                                onClick={() =>
                                  handleSendPasswordReset(member.userId)
                                }
                              >
                                <KeyRoundIcon />
                              </Button>
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Email */}
          <TabsContent value="email" className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Envio de e-mails</p>
                  <Switch checked disabled />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Os e-mails deste pipe são enviados a partir do endereço abaixo,
                  configurado no servidor.
                </p>
                <div className="mt-2 flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                  {mailFromAddress}
                </div>
              </div>

              <Link
                href={`/boards/${boardId}/emails/templates`}
                className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <p className="text-sm font-semibold">Templates de email</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Configure o layout para e-mails que podem ser enviados manual
                  ou automaticamente aos usuários.
                </p>
                <span className="mt-3 inline-block text-xs font-medium text-primary">
                  Gerenciar templates →
                </span>
              </Link>

              <Link
                href={`/boards/${boardId}/emails/automations`}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <MailIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">Automação de email</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Configure automações de e-mail com todos os tipos de gatilhos
                    dentro do fluxo.
                  </p>
                </div>
              </Link>

              <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card p-4 text-muted-foreground">
                <AtSignIcon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">
                    Recebimento de e-mail não disponível
                  </p>
                  <p className="mt-1 text-xs">
                    Este sistema ainda não recebe chamados por e-mail — a
                    abertura acontece pelo formulário público, na aba
                    Formulário.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Configurações do pipe */}
          <TabsContent
            value="configuracoes"
            className="min-h-0 flex-1 overflow-y-auto p-5"
          >
            <h3 className="text-lg font-semibold">Configurações do pipe</h3>

            <form
              onSubmit={handleUpdateBoard}
              className="mt-4 max-w-md space-y-4"
            >
              {boardError && (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertDescription>{boardError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="board-name">Nome do pipe</Label>
                <Input id="board-name" name="name" defaultValue={boardName} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-description">Descrição</Label>
                <Textarea
                  id="board-description"
                  name="description"
                  defaultValue={boardDescription ?? ""}
                  rows={2}
                  placeholder="Do que se trata este pipe?"
                />
              </div>
              <DynamicFormField
                field={{
                  type: "color",
                  name: "color",
                  label: "Cor do pipe",
                  options: PHASE_COLOR_PALETTE.map((option) => ({
                    label: option.label,
                    value: option.value,
                  })),
                }}
                initialValue={boardColor}
              />
              <DynamicFormField
                field={{
                  type: "icon",
                  name: "icon",
                  label: "Ícone do pipe",
                  options: ICON_PALETTE.map((option) => ({
                    label: option.label,
                    value: option.value,
                  })),
                }}
                initialValue={boardIcon ?? undefined}
              />
              <div className="space-y-1.5">
                <Label htmlFor="board-visibility">Privacidade e visibilidade</Label>
                <Select name="visibility" defaultValue={boardVisibility}>
                  <SelectTrigger id="board-visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">
                      Visível para o workspace
                    </SelectItem>
                    <SelectItem value="private">
                      Privado — só membros do quadro
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-create-label">
                  Texto do botão de criar cards
                </Label>
                <Input
                  id="board-create-label"
                  name="createCardButtonLabel"
                  defaultValue={createCardButtonLabel ?? ""}
                  placeholder="Criar novo chamado"
                />
              </div>

              <div className="space-y-1.5 border-t pt-4">
                <Label>Alerta de expirado</Label>
                <p className="text-xs text-muted-foreground">
                  Tempo máximo que um card pode ficar parado numa fase antes
                  de ser marcado como expirado. Deixe em branco para
                  desativar.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    name="expirationValue"
                    defaultValue={expirationMinutes ?? ""}
                    placeholder="0"
                    className="w-28"
                  />
                  <Select name="expirationUnit" defaultValue="minutes">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">minutos</SelectItem>
                      <SelectItem value="hours">horas</SelectItem>
                      <SelectItem value="days">dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {customFields.length > 0 && (
                <div className="space-y-1.5 border-t pt-4">
                  <Label>Campos exibidos nos cards do Kanban</Label>
                  <div className="space-y-2">
                    {customFields.map((field) => (
                      <label
                        key={field.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          name="kanbanVisibleFieldIds"
                          value={field.id}
                          defaultChecked={kanbanVisibleFieldIds.includes(
                            field.id,
                          )}
                        />
                        {field.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2.5 border-t pt-4">
                <Label>Permissões</Label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    name="onlyAssigneeCanEdit"
                    value="true"
                    defaultChecked={onlyAssigneeCanEdit}
                  />
                  As pessoas neste pipe só podem editar os cards atribuídos a
                  elas.
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    name="onlyManagerCanDeleteCards"
                    value="true"
                    defaultChecked={onlyManagerCanDeleteCards}
                  />
                  Somente administradores do pipe podem excluir cards.
                </label>
              </div>

              <div className="flex items-center gap-2 border-t pt-4">
                <Button type="submit" size="sm" disabled={savingBoard}>
                  {savingBoard && <LoaderCircleIcon className="animate-spin" />}
                  Salvar
                </Button>
                {boardSaved && (
                  <span className="text-xs text-priority-low">
                    Alterações salvas.
                  </span>
                )}
              </div>
            </form>

            <div className="mt-8 border-t pt-5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-muted-foreground">
                  Campos personalizados do quadro
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCreatingField(true)}
                >
                  <PlusIcon />
                  Novo campo
                </Button>
              </div>
              <div className="mt-3 rounded-xl border bg-card">
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
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

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
        description="Cria o formulário com título e descrição. Depois, adicione os campos."
        submitLabel="Criar formulário"
      />

      <CardFormDialog
        open={addingFieldToForm}
        onOpenChange={(open) => {
          setAddingFieldToForm(open);
          if (!open) setPaletteFieldType(null);
        }}
        fields={addFormFieldFields}
        submitAction={handleAddFormField}
        initialValues={{ binding: "new", type: paletteFieldType ?? "short_text" }}
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

      <CardFormDialog
        open={creatingPhase}
        onOpenChange={setCreatingPhase}
        fields={[
          {
            type: "text",
            name: "name",
            label: "Nome da fase",
            required: true,
            placeholder: "Ex.: Aguardando aprovação",
          },
          {
            type: "color",
            name: "color",
            label: "Cor",
            options: PHASE_COLOR_PALETTE.map((option) => ({
              label: option.label,
              value: option.value,
            })),
          },
          {
            type: "number",
            name: "cardLimit",
            label: "Limite de cards (opcional)",
            min: 1,
          },
        ]}
        submitAction={handleCreatePhase}
        title="Nova fase"
        description="Adicione uma nova etapa ao final deste fluxo."
        submitLabel="Criar fase"
      />

      <CardFormDialog
        open={addingPhaseField}
        onOpenChange={(open) => {
          setAddingPhaseField(open);
          if (!open) setPalettePhaseFieldType(null);
        }}
        fields={CUSTOM_FIELD_FIELDS}
        submitAction={handleAddPhaseField}
        initialValues={{ type: palettePhaseFieldType ?? "short_text" }}
        title={`Novo campo em "${selectedPhase?.name ?? ""}"`}
        description="Esse campo só aparece nos cards enquanto estiverem nesta fase."
        submitLabel="Adicionar campo"
      />

      <ConfirmDialog
        open={archivingPhaseFieldId !== null}
        onOpenChange={(open) => {
          if (!open) setArchivingPhaseFieldId(null);
        }}
        onConfirm={async () => {
          if (archivingPhaseFieldId) {
            await archiveCustomFieldAction(boardId, archivingPhaseFieldId);
          }
        }}
        title="Arquivar campo"
        description="O campo deixa de aparecer nos cards desta fase, mas os valores já preenchidos são mantidos."
        confirmLabel="Arquivar"
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
            if (deletingFormId === selectedFormId) setSelectedFormId(null);
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

      <ConfirmDialog
        open={deletingPhaseId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingPhaseId(null);
        }}
        onConfirm={handleDeletePhase}
        title="Excluir fase"
        description="Esta ação não pode ser desfeita. Fases com cards não podem ser excluídas — mova ou arquive os cards primeiro."
        confirmLabel="Excluir fase"
      />
    </Dialog>
  );
}
