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
import type { KanbanColumnDTO } from "@/components/app/types"
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
  teal: "border-t-tag-teal",
  blue: "border-t-tag-blue",
  amber: "border-t-tag-amber",
  rose: "border-t-tag-rose",
}

const titleColorStyles: Record<
  NonNullable<KanbanColumnDTO["accent"]>,
  string
> = {
  neutral: "text-foreground",
  teal: "text-tag-teal",
  blue: "text-tag-blue",
  amber: "text-tag-amber",
  rose: "text-tag-rose",
}

export interface KanbanColumnProps {
  column: KanbanColumnDTO
  onCardOpen?: (cardId: string) => void
  onCreateCard?: (columnId: string) => void
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
  const isAtLimit =
    typeof column.limit === "number" && column.cards.length >= column.limit

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
              ? `${column.cards.length} de ${column.limit} cards`
              : `${column.cards.length} cards`
          }
        >
          {column.cards.length}
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
        </div>
      </SortableContext>
    </section>
  )
}
