"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";

import {
  addCommentAction,
  archiveCardAction,
  createCardAction,
  createPhaseAction,
  deletePhaseAction,
  duplicateCardAction,
  getCardActivityAction,
  moveCardAction,
  movePhaseAction,
  sendCardEmailAction,
  updateCardAction,
  updatePhaseAction,
} from "@/app/(app)/boards/[boardId]/actions";
import { CardDetailsSheet } from "@/components/app/card-details-sheet";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { customFieldToFormField } from "@/components/app/custom-field-mapping";
import { KanbanBoard } from "@/components/app/kanban-board";
import {
  getColorForAccent,
  PHASE_COLOR_PALETTE,
} from "@/components/app/phase-colors";
import { PipeHeader } from "@/components/app/pipe-header";
import type {
  AppUserDTO,
  CommentDTO,
  CustomFieldDTO,
  EmailMessageDTO,
  FormFieldDTO,
  FormInitialValue,
  FormSubmitResult,
  KanbanColumnDTO,
  KanbanMoveInput,
} from "@/components/app/types";
import { Button } from "@/components/ui/button";

const BASE_CARD_FIELDS: FormFieldDTO[] = [
  {
    type: "text",
    name: "title",
    label: "Título",
    required: true,
    placeholder: "Ex.: Solicitação de acesso",
  },
  { type: "textarea", name: "description", label: "Descrição", rows: 4 },
  {
    type: "select",
    name: "priority",
    label: "Prioridade",
    options: [
      { label: "Baixa", value: "low" },
      { label: "Média", value: "medium" },
      { label: "Alta", value: "high" },
      { label: "Urgente", value: "urgent" },
    ],
  },
  { type: "date", name: "dueAt", label: "Prazo" },
]

const PHASE_FORM_FIELDS: FormFieldDTO[] = [
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
]

const EMAIL_FORM_FIELDS: FormFieldDTO[] = [
  {
    type: "text",
    name: "to",
    label: "Para",
    required: true,
    placeholder: "nome@empresa.com, outro@empresa.com",
  },
  { type: "text", name: "subject", label: "Assunto", required: true },
  { type: "textarea", name: "body", label: "Mensagem", rows: 6, required: true },
]

export interface BoardViewProps {
  boardId: string;
  boardName: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  columns: KanbanColumnDTO[];
  customFields: CustomFieldDTO[];
}

export function BoardView({
  boardId,
  boardName,
  workspaceName,
  user,
  signOutAction,
  columns,
  customFields,
}: BoardViewProps) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [emailCardId, setEmailCardId] = useState<string | null>(null);
  const [newCardPhaseId, setNewCardPhaseId] = useState<string | null>(null);
  const [creatingPhase, setCreatingPhase] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [deletingPhaseId, setDeletingPhaseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [emails, setEmails] = useState<EmailMessageDTO[]>([]);
  const [activityCardId, setActivityCardId] = useState<string | null>(null);
  const activityLoading = openCardId !== null && activityCardId !== openCardId;

  const cardFormFields = useMemo(() => {
    const dynamicFields = customFields
      .map((field) => customFieldToFormField(field))
      .filter((field): field is FormFieldDTO => field !== null);

    return [...BASE_CARD_FIELDS, ...dynamicFields];
  }, [customFields]);

  const filteredColumns = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return columns;

    return columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) =>
        card.title.toLocaleLowerCase("pt-BR").includes(query)
      ),
    }));
  }, [columns, search]);

  const allCards = columns.flatMap((column) => column.cards);
  const openCard = openCardId
    ? (allCards.find((card) => card.id === openCardId) ?? null)
    : null;
  const editingCard = editingCardId
    ? (allCards.find((card) => card.id === editingCardId) ?? null)
    : null;
  const editingPhase = editingPhaseId
    ? (columns.find((column) => column.id === editingPhaseId) ?? null)
    : null;

  useEffect(() => {
    if (!openCardId) return;

    let cancelled = false;

    getCardActivityAction(openCardId).then((activity) => {
      if (cancelled) return;
      setComments(
        activity.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          authorName: comment.authorName,
          authorAvatarUrl: comment.authorAvatarUrl,
          createdAt: comment.createdAt,
          isOwn: comment.authorId === user.id,
        }))
      );
      setEmails(activity.emails);
      setActivityCardId(openCardId);
    });

    return () => {
      cancelled = true;
    };
  }, [openCardId, user.id]);

  function buildCardInitialValues(
    card: NonNullable<typeof openCard>
  ): Record<string, FormInitialValue> {
    const values: Record<string, FormInitialValue> = {
      title: card.title,
      description: card.description ?? "",
      priority: card.priority ?? "medium",
      dueAt: card.dueDate ? card.dueDate.slice(0, 10) : "",
    };

    for (const field of customFields) {
      const raw = card.customFieldValues?.[field.id];
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        values[`field:${field.id}`] = raw;
      }
    }

    return values;
  }

  const editCardInitialValues = editingCard
    ? buildCardInitialValues(editingCard)
    : {};

  const editPhaseInitialValues: Record<string, FormInitialValue> = editingPhase
    ? {
        name: editingPhase.title,
        color: getColorForAccent(editingPhase.accent),
        cardLimit:
          typeof editingPhase.limit === "number"
            ? String(editingPhase.limit)
            : "",
      }
    : {};

  async function handleMoveCard(input: KanbanMoveInput) {
    await moveCardAction(boardId, {
      cardId: input.cardId,
      destinationPhaseId: input.destinationColumnId,
      position: input.position,
    });
  }

  async function handleCreateCard(formData: FormData): Promise<FormSubmitResult> {
    if (!newCardPhaseId) {
      return { error: "Selecione uma etapa." };
    }

    return createCardAction(boardId, newCardPhaseId, formData);
  }

  async function handleEditCard(formData: FormData): Promise<FormSubmitResult> {
    if (!editingCardId) {
      return { error: "Selecione um card." };
    }

    return updateCardAction(boardId, editingCardId, formData);
  }

  async function handleDuplicateCard(cardId: string) {
    await duplicateCardAction(boardId, cardId);
  }

  async function handleArchiveCard(cardId: string) {
    await archiveCardAction(boardId, cardId);
  }

  async function handleCreatePhase(formData: FormData): Promise<FormSubmitResult> {
    return createPhaseAction(boardId, formData);
  }

  async function handleEditPhase(formData: FormData): Promise<FormSubmitResult> {
    if (!editingPhaseId) {
      return { error: "Selecione uma fase." };
    }

    return updatePhaseAction(boardId, editingPhaseId, formData);
  }

  async function handleMovePhase(columnId: string, direction: "left" | "right") {
    await movePhaseAction(boardId, columnId, direction);
  }

  async function handleDeletePhase() {
    if (!deletingPhaseId) return;
    await deletePhaseAction(boardId, deletingPhaseId);
  }

  async function handleAddComment(body: string) {
    if (!openCardId) return;
    const result = await addCommentAction(boardId, openCardId, (() => {
      const formData = new FormData();
      formData.set("body", body);
      return formData;
    })());

    if (result.success) {
      const activity = await getCardActivityAction(openCardId);
      setComments(
        activity.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          authorName: comment.authorName,
          authorAvatarUrl: comment.authorAvatarUrl,
          createdAt: comment.createdAt,
          isOwn: comment.authorId === user.id,
        }))
      );
    }

    return result;
  }

  async function handleSendEmail(formData: FormData): Promise<FormSubmitResult> {
    if (!emailCardId) {
      return { error: "Selecione um card." };
    }

    const result = await sendCardEmailAction(boardId, emailCardId, formData);

    if (result.success && openCardId === emailCardId) {
      const activity = await getCardActivityAction(emailCardId);
      setEmails(activity.emails);
    }

    return result;
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
      />

      <div className="relative min-h-0 flex-1 bg-[var(--workspace)]">
        <KanbanBoard
          className="h-full pt-4"
          columns={filteredColumns}
          onMoveCard={handleMoveCard}
          onCardOpen={setOpenCardId}
          onCreateCard={setNewCardPhaseId}
          onEditCard={setEditingCardId}
          onDuplicateCard={handleDuplicateCard}
          onArchiveCard={handleArchiveCard}
          onCreatePhase={() => setCreatingPhase(true)}
          onEditPhase={setEditingPhaseId}
          onDeletePhase={setDeletingPhaseId}
          onMovePhase={handleMovePhase}
        />

        {columns.length > 0 && (
          <Button
            type="button"
            className="absolute bottom-5 left-4 rounded-full shadow-lg sm:left-6"
            onClick={() => setNewCardPhaseId(columns[0].id)}
          >
            <PlusIcon />
            Criar novo card
          </Button>
        )}
      </div>

      <CardDetailsSheet
        card={openCard}
        open={openCardId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenCardId(null);
        }}
        onEdit={(cardId) => {
          setOpenCardId(null);
          setEditingCardId(cardId);
        }}
        onSendEmail={(cardId) => {
          setEmailCardId(cardId);
        }}
        customFields={customFields}
        comments={comments}
        commentsLoading={activityLoading}
        onAddComment={handleAddComment}
        emails={emails}
      />

      <CardFormDialog
        open={newCardPhaseId !== null}
        onOpenChange={(open) => {
          if (!open) setNewCardPhaseId(null);
        }}
        fields={cardFormFields}
        submitAction={handleCreateCard}
        title="Novo card"
        description="Preencha os dados para incluir o card nesta etapa."
      />

      <CardFormDialog
        open={editingCardId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCardId(null);
        }}
        fields={cardFormFields}
        submitAction={handleEditCard}
        initialValues={editCardInitialValues}
        title="Editar card"
        description="Atualize os dados deste card."
        submitLabel="Salvar alterações"
      />

      <CardFormDialog
        open={creatingPhase}
        onOpenChange={setCreatingPhase}
        fields={PHASE_FORM_FIELDS}
        submitAction={handleCreatePhase}
        title="Nova fase"
        description="Adicione uma nova etapa ao final deste fluxo."
        submitLabel="Criar fase"
      />

      <CardFormDialog
        open={editingPhaseId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPhaseId(null);
        }}
        fields={PHASE_FORM_FIELDS}
        submitAction={handleEditPhase}
        initialValues={editPhaseInitialValues}
        title="Editar fase"
        description="Atualize o nome, a cor ou o limite de cards desta etapa."
        submitLabel="Salvar alterações"
      />

      <CardFormDialog
        open={emailCardId !== null}
        onOpenChange={(open) => {
          if (!open) setEmailCardId(null);
        }}
        fields={EMAIL_FORM_FIELDS}
        submitAction={handleSendEmail}
        title="Enviar e-mail"
        description="O e-mail é enviado a partir deste card e fica registrado no histórico dele."
        submitLabel="Enviar"
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
    </div>
  );
}
