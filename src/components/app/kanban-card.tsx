"use client"

import type { CSSProperties } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlarmClockIcon,
  ArchiveIcon,
  CalendarDaysIcon,
  CheckSquare2Icon,
  CopyIcon,
  GripVerticalIcon,
  MailIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PencilIcon,
} from "lucide-react"

import type {
  CustomFieldDTO,
  KanbanCardDTO,
  KanbanPriority,
  KanbanTagDTO,
} from "@/components/app/types"
import { isFieldVisibleOnCard } from "@/components/app/phase-field-visibility"
import { useIsPast } from "@/components/app/use-is-past"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const priorityLabels: Record<KanbanPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}

const priorityStyles: Record<KanbanPriority, string> = {
  low: "bg-priority-low/15 text-priority-low",
  medium: "bg-priority-medium/15 text-priority-medium",
  high: "bg-priority-high/15 text-priority-high",
  urgent: "bg-priority-urgent/15 text-priority-urgent",
}

const tagStyles: Record<NonNullable<KanbanTagDTO["color"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  teal: "bg-primary/10 text-primary",
  blue: "bg-tag-blue/10 text-tag-blue",
  amber: "bg-tag-amber/10 text-tag-amber",
  rose: "bg-tag-rose/10 text-tag-rose",
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Sao_Paulo",
})

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function formatDueDate(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function isOverdue(value: string) {
  const date = new Date(value)

  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

function formatCardFieldValue(
  type: CustomFieldDTO["type"],
  value: unknown,
  options?: Array<{ label: string; value: string }>
) {
  if (value === null || value === undefined || value === "") return "—"
  if (type === "checkbox") return value === true || value === "true" ? "Sim" : "Não"
  if ((type === "select" || type === "radio") && options) {
    return options.find((option) => option.value === value)?.label ?? String(value)
  }
  if (type === "attachment") {
    const files = Array.isArray((value as { files?: unknown } | null)?.files)
      ? (value as { files: unknown[] }).files
      : []
    return files.length > 0 ? `${files.length} anexo(s)` : "—"
  }
  return String(value)
}

export interface KanbanCardProps {
  card: KanbanCardDTO
  onOpen?: (cardId: string) => void
  onEdit?: (cardId: string) => void
  onDuplicate?: (cardId: string) => void
  onArchive?: (cardId: string) => void
  disabled?: boolean
  isOverlay?: boolean
  className?: string
  customFields?: CustomFieldDTO[]
  visibleCustomFieldIds?: string[]
}

export function KanbanCard({
  card,
  onOpen,
  onEdit,
  onDuplicate,
  onArchive,
  disabled = false,
  isOverlay = false,
  className,
  customFields,
  visibleCustomFieldIds,
}: KanbanCardProps) {
  const isPhaseExpired = useIsPast(card.phaseDeadline)
  const hasCardMenu = onEdit || onDuplicate || onArchive
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: isOverlay ? `overlay:${card.id}` : card.id,
    data: {
      type: "card",
      columnId: card.columnId,
    },
    disabled: disabled || isOverlay,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const visibleAssignees = card.assignees?.slice(0, 3) ?? []
  const remainingAssignees = Math.max(
    0,
    (card.assignees?.length ?? 0) - visibleAssignees.length
  )
  const overdue = Boolean(card.dueDate && isOverdue(card.dueDate))
  const visibleFields = (visibleCustomFieldIds ?? [])
    .map((fieldId) => customFields?.find((field) => field.id === fieldId))
    .filter((field): field is CustomFieldDTO => Boolean(field))
    .map((field) => ({
      field,
      value: card.customFieldValues?.[field.id],
    }))
    .filter(({ field, value }) =>
      isFieldVisibleOnCard(field, card.columnId, value)
    )

  return (
    <Card
      ref={setNodeRef}
      style={style}
      size="sm"
      data-dragging={isDragging || undefined}
      className={cn(
        "relative gap-3 touch-none overflow-visible border-l-2 border-l-transparent bg-card py-3 shadow-[0_1px_2px_0_rgb(15_23_42/0.05)] ring-1 ring-foreground/8 transition-[box-shadow,opacity,border-color] hover:shadow-md hover:ring-foreground/12 data-dragging:opacity-35",
        !disabled && !isOverlay && "cursor-grab active:cursor-grabbing",
        card.priority === "urgent" && "border-l-priority-urgent",
        card.priority === "high" && "border-l-priority-high",
        isOverlay && "rotate-1 shadow-xl ring-primary/20",
        className
      )}
      {...attributes}
      {...listeners}
    >
      <CardHeader className="grid grid-cols-[1fr_auto] gap-2 px-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.reference && (
              <span className="font-mono text-[0.6875rem] font-medium text-muted-foreground">
                {card.reference}
              </span>
            )}
            {overdue ? (
              <Badge
                variant="ghost"
                className="h-5 gap-1 rounded-full border-0 bg-destructive/10 px-2 text-[0.625rem] font-semibold text-destructive"
              >
                <AlarmClockIcon className="size-3" />
                Atrasado
              </Badge>
            ) : (
              card.priority && (
                <Badge
                  variant="ghost"
                  className={cn(
                    "h-5 rounded-full border-0 px-2 text-[0.625rem] font-semibold",
                    priorityStyles[card.priority]
                  )}
                >
                  {priorityLabels[card.priority]}
                </Badge>
              )
            )}
            {isPhaseExpired && (
              <Badge
                variant="ghost"
                className="h-5 gap-1 rounded-full border-0 bg-priority-high/15 px-2 text-[0.625rem] font-semibold text-priority-high"
                title="Este card está parado nesta fase há mais tempo que o configurado"
              >
                <AlarmClockIcon className="size-3" />
                Parado há muito tempo
              </Badge>
            )}
          </div>
          {onOpen ? (
            <button
              type="button"
              className="line-clamp-2 w-full text-left text-sm font-semibold leading-snug tracking-[-0.01em] outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/40"
              onClick={() => onOpen(card.id)}
            >
              {card.title}
            </button>
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-snug tracking-[-0.01em]">
              {card.title}
            </p>
          )}
        </div>

        <div className="-mr-1 flex items-center">
          {hasCardMenu && !isOverlay && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={`Opções do card ${card.title}`}
                >
                  <MoreVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(card.id)}>
                    <PencilIcon />
                    Editar
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => onDuplicate(card.id)}>
                    <CopyIcon />
                    Duplicar
                  </DropdownMenuItem>
                )}
                {onArchive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onArchive(card.id)}
                    >
                      <ArchiveIcon />
                      Arquivar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center text-muted-foreground"
          >
            <GripVerticalIcon className="size-4" />
          </span>
        </div>
      </CardHeader>

      {(card.description ||
        (card.tags?.length ?? 0) > 0 ||
        visibleFields.length > 0) && (
        <CardContent className="space-y-2 px-3">
          {card.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {card.description}
            </p>
          )}
          {visibleFields.length > 0 && (
            <dl className="space-y-0.5">
              {visibleFields.map(({ field, value }) => (
                <div
                  key={field.id}
                  className="flex items-baseline gap-1 text-[0.6875rem] leading-snug"
                >
                  <dt className="shrink-0 text-muted-foreground">
                    {field.label}:
                  </dt>
                  <dd className="min-w-0 truncate font-medium">
                    {formatCardFieldValue(field.type, value, field.options)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {(card.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tags?.slice(0, 3).map((tag) => (
                <Badge
                  key={tag.id}
                  variant="ghost"
                  className={cn(
                    "h-4 max-w-28 border-0 px-1.5 text-[0.625rem]",
                    tagStyles[tag.color ?? "neutral"]
                  )}
                >
                  <span className="truncate">{tag.label}</span>
                </Badge>
              ))}
              {(card.tags?.length ?? 0) > 3 && (
                <span className="text-[0.625rem] text-muted-foreground">
                  +{(card.tags?.length ?? 0) - 3}
                </span>
              )}
            </div>
          )}
        </CardContent>
      )}

      <div className="flex min-h-6 items-center gap-3 px-3 text-[0.6875rem] text-muted-foreground">
        {card.dueDate && (
          <span
            className={cn(
              "flex items-center gap-1",
              isOverdue(card.dueDate) && "font-medium text-destructive"
            )}
          >
            <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
            {formatDueDate(card.dueDate)}
          </span>
        )}
        {typeof card.attachmentCount === "number" && card.attachmentCount > 0 && (
          <span className="flex items-center gap-1" title="Anexos">
            <PaperclipIcon aria-hidden="true" className="size-3.5" />
            {card.attachmentCount}
          </span>
        )}
        {typeof card.emailCount === "number" && card.emailCount > 0 && (
          <span className="flex items-center gap-1" title="E-mails vinculados">
            <MailIcon aria-hidden="true" className="size-3.5" />
            {card.emailCount}
          </span>
        )}
        {card.checklist && card.checklist.total > 0 && (
          <span className="flex items-center gap-1" title="Itens concluídos">
            <CheckSquare2Icon aria-hidden="true" className="size-3.5" />
            {card.checklist.completed}/{card.checklist.total}
          </span>
        )}
        {visibleAssignees.length > 0 && (
          <AvatarGroup className="ml-auto">
            {visibleAssignees.map((assignee) => (
              <Avatar key={assignee.id} size="sm" title={assignee.name}>
                {assignee.avatarUrl && (
                  <AvatarImage src={assignee.avatarUrl} alt={assignee.name} />
                )}
                <AvatarFallback className="bg-primary/10 text-[0.5625rem] font-semibold text-primary">
                  {assignee.initials || getInitials(assignee.name)}
                </AvatarFallback>
              </Avatar>
            ))}
            {remainingAssignees > 0 && (
              <AvatarGroupCount className="text-[0.5625rem]">
                +{remainingAssignees}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        )}
      </div>
    </Card>
  )
}
