"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, PlusIcon, XIcon } from "lucide-react";

import {
  addCommentAction,
  searchBoardCardsAction,
  archiveCardAction,
  assignCardAction,
  createCardAction,
  createPhaseAction,
  deletePhaseAction,
  duplicateCardAction,
  getCardActivityAction,
  moveCardAction,
  movePhaseAction,
  sendCardEmailAction,
  unassignCardAction,
  updateCardAction,
} from "@/app/(app)/boards/[boardId]/actions";
import { CardDetailsDialog } from "@/components/app/card-details-dialog";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { customFieldToFormField } from "@/components/app/custom-field-mapping";
import { KanbanBoard } from "@/components/app/kanban-board";
import { PHASE_COLOR_PALETTE } from "@/components/app/phase-colors";
import { PipeHeader } from "@/components/app/pipe-header";
import type {
  AppUserDTO,
  AssignableMemberDTO,
  CardHistoryDTO,
  CommentDTO,
  CustomFieldDTO,
  KanbanCardDTO,
  EmailMessageDTO,
  FormFieldDTO,
  FormInitialValue,
  FormSubmitResult,
  KanbanColumnDTO,
  KanbanMoveInput,
} from "@/components/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  boardIcon?: string | null;
  createCardButtonLabel?: string | null;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  columns: KanbanColumnDTO[];
  customFields: CustomFieldDTO[];
  kanbanVisibleFieldIds?: string[];
  assignableMembers?: AssignableMemberDTO[];
}

export function BoardView({
  boardId,
  boardName,
  boardIcon,
  createCardButtonLabel,
  workspaceName,
  user,
  signOutAction,
  columns,
  customFields,
  kanbanVisibleFieldIds = [],
  assignableMembers = [],
}: BoardViewProps) {
  const router = useRouter();
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [emailCardId, setEmailCardId] = useState<string | null>(null);
  const [newCardPhaseId, setNewCardPhaseId] = useState<string | null>(null);
  const [creatingPhase, setCreatingPhase] = useState(false);
  const [deletingPhaseId, setDeletingPhaseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [emails, setEmails] = useState<EmailMessageDTO[]>([]);
  const [history, setHistory] = useState<CardHistoryDTO[]>([]);
  const [activityCardId, setActivityCardId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const activityLoading = openCardId !== null && activityCardId !== openCardId;

  /**
   * Estas ações não têm formulário onde apoiar a mensagem — são cliques diretos
   * (arquivar, atribuir, mover fase). Sem este envelope, uma recusa do servidor
   * viraria uma promessa rejeitada sem dono: nada acontecia na tela e o usuário
   * concluía que tinha funcionado.
   */
  async function runAction(
    action: () => Promise<FormSubmitResult>,
    fallbackMessage: string,
  ): Promise<void> {
    setActionError(null);

    try {
      const result = await action();

      // A recusa vem no retorno, não como exceção: o Next apaga a mensagem de
      // erros lançados de server actions em produção.
      if (result?.error) setActionError(result.error);
    } catch {
      setActionError(fallbackMessage);
    }
  }

  function getCardFormFields(phaseId: string | null) {
    const dynamicFields = customFields
      .filter((field) => !field.phaseId || field.phaseId === phaseId)
      .map((field) => customFieldToFormField(field))
      .filter((field): field is FormFieldDTO => field !== null);

    return [...BASE_CARD_FIELDS, ...dynamicFields];
  }

  // A busca vai ao servidor porque o quadro carrega no máximo 100 cards por
  // fase: filtrar o que está em memória esconderia justamente os cards antigos.
  const [searchResults, setSearchResults] = useState<KanbanCardDTO[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const trimmedSearch = search.trim();
  // Um termo curto não vale uma consulta; a leitura abaixo ignora resultados
  // antigos nesse caso, então o efeito não precisa limpar estado ao sair.
  const isSearchActive = trimmedSearch.length >= 2;

  useEffect(() => {
    if (!isSearchActive) return;

    let cancelled = false;

    // Espera o usuário parar de digitar antes de consultar. O indicador só
    // acende quando a consulta realmente sai, para não piscar a cada tecla.
    const timer = setTimeout(() => {
      if (cancelled) return;
      setSearching(true);

      searchBoardCardsAction(boardId, trimmedSearch)
        .then((result) => {
          if (cancelled) return;
          setSearchResults(result.cards);
        })
        .catch(() => {
          if (cancelled) return;
          setActionError("Não foi possível buscar os cards.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [boardId, isSearchActive, trimmedSearch]);

  const filteredColumns = useMemo(() => {
    if (!isSearchActive || !searchResults) return columns;

    // As colunas são remontadas a partir do resultado do servidor, não
    // filtradas sobre o que estava carregado — é isso que faz a busca alcançar
    // cards fora do teto por fase.
    const byPhase = new Map<string, KanbanCardDTO[]>();
    for (const card of searchResults) {
      const bucket = byPhase.get(card.columnId) ?? [];
      bucket.push(card);
      byPhase.set(card.columnId, bucket);
    }

    return columns.map((column) => {
      const cards = byPhase.get(column.id) ?? [];

      // Durante a busca a coluna mostra quantos casaram, não o total da fase.
      return { ...column, cards, totalCards: cards.length };
    });
  }, [columns, isSearchActive, searchResults]);

  const allCards = columns.flatMap((column) => column.cards);
  const openCard = openCardId
    ? (allCards.find((card) => card.id === openCardId) ?? null)
    : null;
  const editingCard = editingCardId
    ? (allCards.find((card) => card.id === editingCardId) ?? null)
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
      setHistory(activity.history);
      setActivityCardId(openCardId);
    }).catch(() => {
      if (cancelled) return;
      // Sem isto a promessa rejeitada morria em silêncio e o painel do card
      // ficava preso no estado de carregamento, sem explicação.
      setActivityCardId(openCardId);
      setActionError(
        "Não foi possível carregar o histórico deste card. Feche e abra novamente.",
      );
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
    await runAction(
      () => duplicateCardAction(boardId, cardId),
      "Não foi possível duplicar o card.",
    );
  }

  async function handleArchiveCard(cardId: string) {
    await runAction(
      () => archiveCardAction(boardId, cardId),
      "Não foi possível arquivar o card.",
    );
  }

  async function handleAssignCard(cardId: string, userId: string) {
    await runAction(
      () => assignCardAction(boardId, cardId, userId),
      "Não foi possível atribuir o responsável.",
    );
  }

  async function handleUnassignCard(cardId: string, userId: string) {
    await runAction(
      () => unassignCardAction(boardId, cardId, userId),
      "Não foi possível remover o responsável.",
    );
  }

  async function handleCreatePhase(formData: FormData): Promise<FormSubmitResult> {
    return createPhaseAction(boardId, formData);
  }

  async function handleMovePhase(columnId: string, direction: "left" | "right") {
    await runAction(
      () => movePhaseAction(boardId, columnId, direction),
      "Não foi possível mover a fase.",
    );
  }

  async function handleDeletePhase() {
    if (!deletingPhaseId) return;
    await runAction(
      () => deletePhaseAction(boardId, deletingPhaseId),
      "Não foi possível excluir a fase.",
    );
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
        boardIcon={boardIcon}
        workspaceName={workspaceName}
        user={user}
        dashboardHref="/"
        signOutAction={signOutAction}
        searchValue={search}
        onSearchChange={setSearch}
      />

      {actionError && (
        <Alert variant="destructive" className="relative mx-4 mt-3 w-auto sm:mx-6">
          <CircleAlertIcon />
          <AlertDescription>{actionError}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute right-2 top-2"
            aria-label="Fechar aviso"
            onClick={() => setActionError(null)}
          >
            <XIcon />
          </Button>
        </Alert>
      )}

      <div className="relative min-h-0 flex-1 bg-[var(--workspace)]">
        <KanbanBoard
          isUpdating={isSearchActive && searching}
          className="h-full pt-4"
          columns={filteredColumns}
          onMoveCard={handleMoveCard}
          onCardOpen={setOpenCardId}
          onCreateCard={setNewCardPhaseId}
          createCardButtonLabel={createCardButtonLabel}
          customFields={customFields}
          visibleCustomFieldIds={kanbanVisibleFieldIds}
          onEditCard={setEditingCardId}
          onDuplicateCard={handleDuplicateCard}
          onArchiveCard={handleArchiveCard}
          onCreatePhase={() => setCreatingPhase(true)}
          onEditPhase={(id) =>
            router.push(`/boards/${boardId}/manage?tab=fases&phaseId=${id}`)
          }
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

      <CardDetailsDialog
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
        history={history}
        columns={columns}
        onMoveCard={handleMoveCard}
        assignableMembers={assignableMembers}
        onAssign={handleAssignCard}
        onUnassign={handleUnassignCard}
      />

      <CardFormDialog
        open={newCardPhaseId !== null}
        onOpenChange={(open) => {
          if (!open) setNewCardPhaseId(null);
        }}
        fields={getCardFormFields(newCardPhaseId)}
        submitAction={handleCreateCard}
        title="Novo card"
        description="Preencha os dados para incluir o card nesta etapa."
      />

      <CardFormDialog
        open={editingCardId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCardId(null);
        }}
        fields={getCardFormFields(editingCard?.columnId ?? null)}
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
