"use client"

import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { KanbanCard } from "@/components/app/kanban-card"
import type { CustomFieldDTO, KanbanColumnDTO } from "@/components/app/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const topBorderStyles: Record<
  NonNullable<KanbanColumnDTO["accent"]>,
  string
> = {
  neutral: "border-t-muted-foreground/50",
  sky: "border-t-sky-500",
  red: "border-t-red-600",
  pink: "border-t-pink-500",
  purple: "border-t-purple-600",
  lime: "border-t-lime-600",
}

const titleColorStyles: Record<
  NonNullable<KanbanColumnDTO["accent"]>,
  string
> = {
  neutral: "text-foreground",
  sky: "text-sky-600",
  red: "text-red-600",
  pink: "text-pink-600",
  purple: "text-purple-600",
  lime: "text-lime-700",
}

export interface KanbanColumnProps {
  column: KanbanColumnDTO
  onCardOpen?: (cardId: string) => void
  onCreateCard?: (columnId: string) => void
  createCardButtonLabel?: string | null
  customFields?: CustomFieldDTO[]
  visibleCustomFieldIds?: string[]
  onEditCard?: (cardId: string) => void
  onDuplicateCard?: (cardId: string) => void
  onArchiveCard?: (cardId: string) => void
  onEditPhase?: (columnId: string) => void
  onDeletePhase?: (columnId: string) => void
  onMovePhaseLeft?: (columnId: string) => void
  onMovePhaseRight?: (columnId: string) => void
  canMovePhaseLeft?: boolean
  canMovePhaseRight?: boolean
  canMoveCards?: boolean
  className?: string
}

export function KanbanColumn({
  column,
  onCardOpen,
  onCreateCard,
  createCardButtonLabel,
  customFields,
  visibleCustomFieldIds,
  onEditCard,
  onDuplicateCard,
  onArchiveCard,
  onEditPhase,
  onDeletePhase,
  onMovePhaseLeft,
  onMovePhaseRight,
  canMovePhaseLeft = false,
  canMovePhaseRight = false,
  canMoveCards = true,
  className,
}: KanbanColumnProps) {
  const hasPhaseMenu =
    onEditPhase || onDeletePhase || onMovePhaseLeft || onMovePhaseRight
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${column.id}`,
    data: {
      type: "column",
      columnId: column.id,
    },
    disabled: !canMoveCards,
  })
  // O quadro carrega no máximo N cards por fase; `totalCards` é quanto existe
  // de fato. Mostrar `cards.length` faria a coluna parecer menor do que é.
  const totalCards = column.totalCards ?? column.cards.length
  const hiddenCards = Math.max(0, totalCards - column.cards.length)
  const isAtLimit =
    typeof column.limit === "number" && totalCards >= column.limit

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-title-${column.id}`}
      className={cn(
        "flex h-full w-[min(20rem,calc(100vw-2rem))] shrink-0 flex-col rounded-xl border-t-[3px] bg-column/70 ring-1 ring-foreground/7 transition-[background-color,box-shadow] sm:w-80",
        topBorderStyles[column.accent ?? "neutral"],
        isOver && "bg-primary/5 ring-2 ring-primary/25",
        className
      )}
    >
      <div className="flex min-h-14 items-center gap-2 px-3.5">
        <h2
          id={`column-title-${column.id}`}
          className={cn(
            "min-w-0 flex-1 truncate font-heading text-sm font-semibold",
            titleColorStyles[column.accent ?? "neutral"]
          )}
        >
          {column.title}
        </h2>
        <Badge
          variant={isAtLimit ? "destructive" : "secondary"}
          className="h-5 min-w-5 px-1.5 font-mono text-[0.65rem]"
          title={
            typeof column.limit === "number"
              ? `${totalCards} de ${column.limit} cards`
              : `${totalCards} cards`
          }
        >
          {totalCards}
          {typeof column.limit === "number" && `/${column.limit}`}
        </Badge>
        {onCreateCard && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Criar card em ${column.title}`}
            onClick={() => onCreateCard(column.id)}
          >
            <PlusIcon />
          </Button>
        )}
        {hasPhaseMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Opções da etapa ${column.title}`}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEditPhase && (
                <DropdownMenuItem onClick={() => onEditPhase(column.id)}>
                  <PencilIcon />
                  Editar fase
                </DropdownMenuItem>
              )}
              {(onMovePhaseLeft || onMovePhaseRight) && (
                <>
                  <DropdownMenuItem
                    disabled={!canMovePhaseLeft}
                    onClick={() => onMovePhaseLeft?.(column.id)}
                  >
                    <ArrowLeftIcon />
                    Mover para esquerda
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canMovePhaseRight}
                    onClick={() => onMovePhaseRight?.(column.id)}
                  >
                    <ArrowRightIcon />
                    Mover para direita
                  </DropdownMenuItem>
                </>
              )}
              {onDeletePhase && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeletePhase(column.id)}
                  >
                    <Trash2Icon />
                    Excluir fase
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <SortableContext
        items={column.cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-32 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onOpen={onCardOpen}
              onEdit={onEditCard}
              onDuplicate={onDuplicateCard}
              onArchive={onArchiveCard}
              disabled={!canMoveCards}
              customFields={customFields}
              visibleCustomFieldIds={visibleCustomFieldIds}
            />
          ))}
          {column.cards.length === 0 && (
            <div
              className={cn(
                "grid min-h-28 place-items-center rounded-lg border border-dashed border-border/80 bg-background/45 px-5 text-center text-xs leading-relaxed text-muted-foreground transition-colors",
                isOver && "border-primary/40 bg-primary/5 text-primary"
              )}
            >
              {isOver
                ? "Solte o card nesta etapa"
                : "Nenhum card nesta etapa"}
            </div>
          )}
          {hiddenCards > 0 && (
            <p className="px-1 py-2 text-center text-xs text-muted-foreground">
              Mais {hiddenCards} card{hiddenCards === 1 ? "" : "s"} nesta etapa.
              Use os relatórios para ver todos.
            </p>
          )}
        </div>
      </SortableContext>

      {column.isInitial && onCreateCard && (
        <div className="px-2.5 pb-3">
          <Button
            type="button"
            onClick={() => onCreateCard(column.id)}
            className="w-full rounded-full"
          >
            <PlusIcon />
            {createCardButtonLabel || "Criar novo chamado"}
          </Button>
        </div>
      )}
    </section>
  )
}
