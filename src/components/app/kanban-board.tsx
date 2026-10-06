"use client"

import { useCallback, useMemo, useState } from "react"
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { KanbanCard } from "@/components/app/kanban-card"
import { KanbanColumn } from "@/components/app/kanban-column"
import type {
  CustomFieldDTO,
  KanbanColumnDTO,
  KanbanMoveInput,
} from "@/components/app/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface KanbanBoardProps {
  columns: KanbanColumnDTO[]
  /**
   * Devolve `{ error }` quando o servidor recusa o movimento — limite da fase
   * atingido, permissão insuficiente. Lançar não serviria: o Next apaga a
   * mensagem de exceções vindas de server actions em produção.
   */
  onMoveCard?: (
    input: KanbanMoveInput
  ) => void | Promise<void | { error?: string; success?: boolean }>
  onCardOpen?: (cardId: string) => void
  onCreateCard?: (columnId: string) => void
  createCardButtonLabel?: string | null
  customFields?: CustomFieldDTO[]
  visibleCustomFieldIds?: string[]
  onEditCard?: (cardId: string) => void
  onDuplicateCard?: (cardId: string) => void
  onArchiveCard?: (cardId: string) => void
  onCreatePhase?: () => void
  onEditPhase?: (columnId: string) => void
  onDeletePhase?: (columnId: string) => void
  onMovePhase?: (columnId: string, direction: "left" | "right") => void
  canMoveCards?: boolean
  isUpdating?: boolean
  className?: string
}

function findCard(columns: KanbanColumnDTO[], cardId: string) {
  for (const column of columns) {
    const card = column.cards.find((item) => item.id === cardId)
    if (card) return card
  }

  return undefined
}

function findColumnForCard(columns: KanbanColumnDTO[], cardId: string) {
  return columns.find((column) =>
    column.cards.some((card) => card.id === cardId)
  )
}

function moveCard(
  columns: KanbanColumnDTO[],
  input: KanbanMoveInput
): KanbanColumnDTO[] {
  const sourceColumn = columns.find(
    (column) => column.id === input.sourceColumnId
  )
  const sourceCard = sourceColumn?.cards.find(
    (card) => card.id === input.cardId
  )

  if (!sourceColumn || !sourceCard) return columns

  return columns.map((column) => {
    if (
      column.id !== input.sourceColumnId &&
      column.id !== input.destinationColumnId
    ) {
      return column
    }

    const withoutCard = column.cards.filter(
      (card) => card.id !== input.cardId
    )

    if (column.id !== input.destinationColumnId) {
      return { ...column, cards: withoutCard }
    }

    const nextCards = [...withoutCard]
    const position = Math.max(0, Math.min(input.position, nextCards.length))
    nextCards.splice(position, 0, {
      ...sourceCard,
      columnId: input.destinationColumnId,
    })

    return { ...column, cards: nextCards }
  })
}

export function KanbanBoard({
  columns,
  onMoveCard,
  onCardOpen,
  onCreateCard,
  createCardButtonLabel,
  customFields,
  visibleCustomFieldIds,
  onEditCard,
  onDuplicateCard,
  onArchiveCard,
  onCreatePhase,
  onEditPhase,
  onDeletePhase,
  onMovePhase,
  canMoveCards = true,
  isUpdating = false,
  className,
}: KanbanBoardProps) {
  const [localColumns, setLocalColumns] = useState(columns)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isMoving, setIsMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const [syncedColumns, setSyncedColumns] = useState(columns)

  // O estado local existe para o arrastar-e-soltar responder na hora. Quando o
  // servidor manda uma versão nova, ela precisa substituir a otimista — mas não
  // no meio de um movimento em curso, senão o card volta para a origem antes de
  // a gravação terminar. Ajustar durante o render evita o quadro intermediário
  // em que a tela mostraria dados já superados.
  if (columns !== syncedColumns && !isMoving) {
    setSyncedColumns(columns)
    setLocalColumns(columns)
  }

  const activeCard = useMemo(
    () =>
      activeCardId ? findCard(localColumns, activeCardId) ?? null : null,
    [activeCardId, localColumns]
  )
  const movementDisabled = !canMoveCards || isMoving || isUpdating

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setMoveError(null)
    setActiveCardId(String(event.active.id))
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveCardId(null)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCardId(null)

      const { active, over } = event
      if (!over || active.id === over.id) return

      const cardId = String(active.id)
      const sourceColumn = findColumnForCard(localColumns, cardId)
      if (!sourceColumn) return

      const overData = over.data.current as
        | { type?: string; columnId?: string }
        | undefined
      const destinationColumnId =
        overData?.columnId ??
        (String(over.id).startsWith("column:")
          ? String(over.id).slice("column:".length)
          : undefined)
      const destinationColumn = localColumns.find(
        (column) => column.id === destinationColumnId
      )
      if (!destinationColumn) return

      const overCardIndex = destinationColumn.cards.findIndex(
        (card) => card.id === String(over.id)
      )
      const position =
        overCardIndex >= 0 ? overCardIndex : destinationColumn.cards.length
      const sourcePosition = sourceColumn.cards.findIndex(
        (card) => card.id === cardId
      )

      if (
        sourceColumn.id === destinationColumn.id &&
        sourcePosition === position
      ) {
        return
      }

      const input: KanbanMoveInput = {
        cardId,
        sourceColumnId: sourceColumn.id,
        destinationColumnId: destinationColumn.id,
        position,
      }
      const previousColumns = localColumns
      setLocalColumns(moveCard(localColumns, input))

      if (!onMoveCard) return

      setIsMoving(true)
      try {
        const result = await onMoveCard(input)

        if (result?.error) {
          setLocalColumns(previousColumns)
          setMoveError(result.error)
        }
      } catch {
        setLocalColumns(previousColumns)
        setMoveError(
          "Não foi possível mover o card. A alteração foi desfeita."
        )
      } finally {
        setIsMoving(false)
      }
    },
    [localColumns, onMoveCard]
  )

  if (localColumns.length === 0) {
    return (
      <EmptyState
        icon="board"
        title="Seu fluxo ainda não tem etapas"
        description="Crie etapas para organizar a entrada, a triagem e o andamento dos cards."
        actionLabel={onCreatePhase ? "Criar etapa" : undefined}
        onAction={onCreatePhase}
        className={className}
      />
    )
  }

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      {moveError && (
        <Alert variant="destructive" className="mx-4 mb-3 w-auto sm:mx-6">
          <AlertTitle>Movimentação não salva</AlertTitle>
          <AlertDescription>{moveError}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute right-2 top-2"
            aria-label="Fechar aviso"
            onClick={() => setMoveError(null)}
          >
            <XIcon />
          </Button>
        </Alert>
      )}

      {(isMoving || isUpdating) && (
        <div
          role="status"
          className="absolute right-5 top-2 z-20 flex items-center gap-1.5 rounded-full border bg-background/95 px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
        >
          <LoaderCircleIcon className="size-3.5 animate-spin" />
          Salvando...
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Para mover um card, pressione espaço. Use as setas para escolher a posição e pressione espaço novamente para soltar.",
          },
        }}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:gap-4 sm:px-6 sm:pb-6">
          {localColumns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onCardOpen={onCardOpen}
              onCreateCard={onCreateCard}
              createCardButtonLabel={createCardButtonLabel}
              customFields={customFields}
              visibleCustomFieldIds={visibleCustomFieldIds}
              onEditCard={onEditCard}
              onDuplicateCard={onDuplicateCard}
              onArchiveCard={onArchiveCard}
              onEditPhase={onEditPhase}
              onDeletePhase={onDeletePhase}
              onMovePhaseLeft={
                onMovePhase ? () => onMovePhase(column.id, "left") : undefined
              }
              onMovePhaseRight={
                onMovePhase ? () => onMovePhase(column.id, "right") : undefined
              }
              canMovePhaseLeft={index > 0}
              canMovePhaseRight={index < localColumns.length - 1}
              canMoveCards={!movementDisabled}
            />
          ))}
          {onCreatePhase && (
            <button
              type="button"
              onClick={onCreatePhase}
              className="flex h-14 w-[min(20rem,calc(100vw-2rem))] shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-dashed border-border bg-background/60 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary sm:w-80"
            >
              <PlusIcon className="size-4" />
              Nova fase
            </button>
          )}
        </div>
        <DragOverlay>
          {activeCard ? (
            <KanbanCard
              card={activeCard}
              isOverlay
              className="w-80"
              customFields={customFields}
              visibleCustomFieldIds={visibleCustomFieldIds}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
