"use client"

import { useState, type ComponentType } from "react"
import { ptBR } from "date-fns/locale"
import { formatDistanceToNow } from "date-fns"
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  CircleAlertIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MailIcon,
  HistoryIcon,
  MessageCircleIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  TicketIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"

import { describeCardEvent } from "@/components/app/card-event-text"
import { useIsPast } from "@/components/app/use-is-past"
import type {
  AssignableMemberDTO,
  CardHistoryDTO,
  CommentDTO,
  CustomFieldDTO,
  EmailMessageDTO,
  KanbanCardDTO,
  KanbanColumnDTO,
  KanbanMoveInput,
  KanbanPriority,
} from "@/components/app/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const priorityLabels: Record<KanbanPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}

const priorityStyles: Record<KanbanPriority, string> = {
  low: "bg-priority-low/10 text-priority-low",
  medium: "bg-priority-medium/10 text-priority-medium",
  high: "bg-priority-high/10 text-priority-high",
  urgent: "bg-priority-urgent/10 text-priority-urgent",
}

const emailStatusLabels: Record<EmailMessageDTO["status"], string> = {
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
}

const emailStatusStyles: Record<EmailMessageDTO["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  sending: "bg-tag-blue/10 text-tag-blue",
  sent: "bg-priority-low/10 text-priority-low",
  failed: "bg-priority-urgent/10 text-priority-urgent",
  cancelled: "bg-muted text-muted-foreground",
}

const phaseAccentStyles: Record<
  NonNullable<KanbanColumnDTO["accent"]>,
  string
> = {
  neutral: "bg-muted-foreground/10 text-muted-foreground",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  red: "bg-red-600/10 text-red-600 dark:text-red-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  purple: "bg-purple-600/10 text-purple-600 dark:text-purple-400",
  lime: "bg-lime-600/10 text-lime-700 dark:text-lime-400",
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
})

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
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

function formatDate(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function formatRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
}

function formatFieldValue(
  type: CustomFieldDTO["type"],
  value: unknown,
  options?: Array<{ label: string; value: string }>
) {
  if (value === null || value === undefined || value === "") {
    return "—"
  }

  if (type === "checkbox") {
    return value === true || value === "true" ? "Sim" : "Não"
  }

  if ((type === "select" || type === "radio") && options) {
    return options.find((option) => option.value === value)?.label ?? String(value)
  }

  if (type === "date" || type === "datetime") {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : formatDate(date.toISOString())
  }

  return String(value)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function renderFieldValue(field: CustomFieldDTO, value: unknown) {
  if (field.type === "attachment") {
    const files = Array.isArray((value as { files?: unknown } | null)?.files)
      ? (
          value as {
            files: Array<{
              id: string
              fileName: string
              sizeBytes: number
            }>
          }
        ).files
      : []

    if (files.length === 0) {
      return <span className="text-muted-foreground">—</span>
    }

    return (
      <ul className="space-y-1">
        {files.map((file) => (
          <li key={file.id}>
            <a
              href={`/api/attachments/${file.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <PaperclipIcon className="size-3.5 shrink-0" />
              <span className="truncate">{file.fileName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                ({formatFileSize(file.sizeBytes)})
              </span>
            </a>
          </li>
        ))}
      </ul>
    )
  }

  return formatFieldValue(field.type, value, field.options)
}

type CardDetailTab =
  | "formulario"
  | "atividades"
  | "anexos"
  | "checklists"
  | "comentarios"
  | "email"

type ActivityEntry =
  | { kind: "comment"; id: string; timestamp: string; comment: CommentDTO }
  | { kind: "email"; id: string; timestamp: string; email: EmailMessageDTO }
  | { kind: "history"; id: string; timestamp: string; entry: CardHistoryDTO }

export interface CardDetailsDialogProps {
  card: KanbanCardDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (cardId: string) => void | Promise<void>
  onSendEmail?: (cardId: string) => void | Promise<void>
  customFields?: CustomFieldDTO[]
  comments?: CommentDTO[]
  history?: CardHistoryDTO[]
  commentsLoading?: boolean
  onAddComment?: (body: string) => Promise<{ error?: string } | void>
  emails?: EmailMessageDTO[]
  columns?: KanbanColumnDTO[]
  onMoveCard?: (input: KanbanMoveInput) => void | Promise<void>
  assignableMembers?: AssignableMemberDTO[]
  onAssign?: (cardId: string, userId: string) => void | Promise<void>
  onUnassign?: (cardId: string, userId: string) => void | Promise<void>
}

export function CardDetailsDialog({
  card,
  open,
  onOpenChange,
  onEdit,
  onSendEmail,
  customFields = [],
  comments = [],
  history = [],
  commentsLoading = false,
  onAddComment,
  emails = [],
  columns = [],
  onMoveCard,
  assignableMembers = [],
  onAssign,
  onUnassign,
}: CardDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState<CardDetailTab>("formulario")
  const [pendingAction, setPendingAction] = useState<"edit" | "email" | null>(
    null
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [movingPhaseId, setMovingPhaseId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  // Relógio compartilhado: ler a hora direto no render deixaria o vencimento
  // congelado no instante em que o diálogo abriu.
  const isOverdue = useIsPast(card?.dueDate)

  async function runAction(
    action: "edit" | "email",
    callback: ((cardId: string) => void | Promise<void>) | undefined
  ) {
    if (!card || !callback) return

    setPendingAction(action)
    setActionError(null)
    try {
      await callback(card.id)
    } catch {
      setActionError("Não foi possível concluir esta ação agora.")
    } finally {
      setPendingAction(null)
    }
  }

  async function handleSubmitComment() {
    if (!onAddComment || !commentBody.trim()) return

    setSubmittingComment(true)
    setCommentError(null)
    try {
      const result = await onAddComment(commentBody.trim())
      if (result?.error) {
        setCommentError(result.error)
        return
      }
      setCommentBody("")
    } catch {
      setCommentError("Não foi possível enviar o comentário.")
    } finally {
      setSubmittingComment(false)
    }
  }

  async function handleMoveToPhase(target: KanbanColumnDTO) {
    if (!card || !onMoveCard || movingPhaseId) return

    setMovingPhaseId(target.id)
    setMoveError(null)
    try {
      await onMoveCard({
        cardId: card.id,
        sourceColumnId: card.columnId,
        destinationColumnId: target.id,
        position: target.cards.length,
      })
    } catch {
      setMoveError("Não foi possível mover o card agora.")
    } finally {
      setMovingPhaseId(null)
    }
  }

  async function handleAssign(userId: string) {
    if (!card || !onAssign) return
    setAssigningUserId(userId)
    try {
      await onAssign(card.id, userId)
    } finally {
      setAssigningUserId(null)
    }
  }

  async function handleUnassign(userId: string) {
    if (!card || !onUnassign) return
    setAssigningUserId(userId)
    try {
      await onUnassign(card.id, userId)
    } finally {
      setAssigningUserId(null)
    }
  }

  const currentPhase = card
    ? columns.find((column) => column.id === card.columnId)
    : undefined
  const otherPhases = columns.filter((column) => column.id !== card?.columnId)
  const assignedUserIds = new Set(card?.assignees?.map((a) => a.id) ?? [])
  const unassignedMembers = assignableMembers.filter(
    (member) => !assignedUserIds.has(member.userId)
  )

  const cardCustomFields = card
    ? customFields
        .filter((field) => !field.phaseId || field.phaseId === card.columnId)
        .map((field) => ({
          field,
          value: card.customFieldValues?.[field.id],
        }))
    : []

  const cardAttachments = cardCustomFields.flatMap(({ field, value }) => {
    if (field.type !== "attachment") return []
    const files = Array.isArray((value as { files?: unknown } | null)?.files)
      ? (
          value as {
            files: Array<{ id: string; fileName: string; sizeBytes: number }>
          }
        ).files
      : []
    return files.map((file) => ({ ...file, fieldLabel: field.label }))
  })

  const activityEntries: ActivityEntry[] = [
    ...comments.map(
      (comment): ActivityEntry => ({
        kind: "comment",
        id: comment.id,
        timestamp: comment.createdAt,
        comment,
      })
    ),
    ...emails.map(
      (email): ActivityEntry => ({
        kind: "email",
        id: email.id,
        timestamp: email.sentAt ?? email.createdAt,
        email,
      })
    ),
    ...history.map(
      (entry): ActivityEntry => ({
        kind: "history",
        id: entry.id,
        timestamp: entry.occurredAt,
        entry,
      })
    ),
  ].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const tabConfig: Array<{
    key: CardDetailTab
    label: string
    icon: ComponentType<{ className?: string }>
    count?: number
  }> = [
    { key: "formulario", label: "Novo Chamado", icon: TicketIcon },
    { key: "atividades", label: "Atividades", icon: ActivityIcon },
    {
      key: "anexos",
      label: "Anexos",
      icon: PaperclipIcon,
      count: cardAttachments.length || undefined,
    },
    { key: "checklists", label: "Checklists", icon: ListChecksIcon },
    {
      key: "comentarios",
      label: "Comentários",
      icon: MessageCircleIcon,
      count: comments.length || undefined,
    },
    {
      key: "email",
      label: "Email",
      icon: MailIcon,
      count: emails.length || undefined,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-full max-w-[92vw] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-6xl">
        <DialogTitle className="sr-only">
          {card?.title ?? "Detalhes do card"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Consulte as informações, o formulário e a fase deste card.
        </DialogDescription>

        {!card ? (
          <div className="flex-1 space-y-6 overflow-hidden p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 border-b px-5 py-4 pr-14">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {card.reference && (
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      {card.reference}
                    </span>
                  )}
                  {card.priority && (
                    <Badge
                      variant="ghost"
                      className={cn("border-0", priorityStyles[card.priority])}
                    >
                      {priorityLabels[card.priority]}
                    </Badge>
                  )}
                </div>
                <h2 className="mt-1 truncate font-heading text-lg font-semibold leading-snug">
                  {card.title}
                </h2>
              </div>
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  disabled={pendingAction !== null}
                  onClick={() => runAction("edit", onEdit)}
                  aria-label="Editar card"
                >
                  {pendingAction === "edit" ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <PencilIcon />
                  )}
                </Button>
              )}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_16rem_16rem]">
              <div className="min-h-0 overflow-y-auto border-b px-5 py-5 lg:border-r lg:border-b-0">
                {actionError && (
                  <Alert variant="destructive" className="mb-5">
                    <CircleAlertIcon />
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Só exibe o vencimento; editar a data ainda não existe.
                        Vencido usa o mesmo vermelho do quadro, para o sinal ser
                        o mesmo dos dois lados. */}
                    {card.dueDate && (
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-sm",
                          isOverdue
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        <CalendarDaysIcon className="size-4" aria-hidden="true" />
                        {formatDate(card.dueDate)}
                      </span>
                    )}
                    {card.tags?.map((tag) => (
                      <Badge key={tag.id} variant="secondary">
                        {tag.label}
                      </Badge>
                    ))}
                  </div>

                  <div
                    role="tablist"
                    aria-label="Seções do card"
                    className="flex flex-wrap items-center gap-1.5 border-b pb-4"
                  >
                    {tabConfig.map(({ key, label, icon: Icon, count }, index) => (
                      <div key={key} className="flex items-center gap-1.5">
                        {index === 4 && (
                          <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                        )}
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTab === key}
                          onClick={() => setActiveTab(key)}
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            activeTab === key
                              ? "border-foreground/15 bg-muted text-foreground"
                              : "border-border text-muted-foreground hover:bg-muted/60"
                          )}
                        >
                          <Icon className="size-3.5" />
                          {label}
                          {count !== undefined && (
                            <Badge
                              variant="secondary"
                              className="h-4 min-w-4 px-1 text-[0.625rem]"
                            >
                              {count}
                            </Badge>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>

                  {activeTab === "formulario" && (
                    <section
                      aria-labelledby="card-form-title"
                      className="space-y-3"
                    >
                      <h3
                        id="card-form-title"
                        className="text-sm font-semibold"
                      >
                        Formulário Inicial
                      </h3>
                      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">
                            Descrição
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                            {card.description || "—"}
                          </dd>
                        </div>
                        {cardCustomFields.map(({ field, value }) => (
                          <div key={field.id}>
                            <dt className="text-xs text-muted-foreground">
                              {field.label}
                            </dt>
                            <dd className="mt-0.5 text-sm font-medium">
                              {renderFieldValue(field, value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}

                  {activeTab === "atividades" && (
                    <section
                      aria-labelledby="card-activity-title"
                      className="space-y-3"
                    >
                      <h3
                        id="card-activity-title"
                        className="flex items-center gap-1.5 text-sm font-semibold"
                      >
                        <ActivityIcon className="size-3.5" />
                        Atividades
                      </h3>

                      {activityEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma atividade registrada ainda.
                        </p>
                      ) : (
                        <ul className="space-y-4">
                          {activityEntries.map((entry) => (
                            <li
                              key={`${entry.kind}-${entry.id}`}
                              className="flex items-start gap-2.5"
                            >
                              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                                {entry.kind === "email" ? (
                                  <MailIcon className="size-3.5" />
                                ) : entry.kind === "history" ? (
                                  <HistoryIcon className="size-3.5" />
                                ) : (
                                  <MessageCircleIcon className="size-3.5" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                {entry.kind === "email" ? (
                                  <p className="text-sm leading-snug">
                                    {entry.email.isAutomated
                                      ? "Uma automação enviou um e-mail: "
                                      : "Um e-mail foi enviado: "}
                                    <span className="font-medium">
                                      {entry.email.subject}
                                    </span>
                                  </p>
                                ) : entry.kind === "history" ? (
                                  <p className="text-sm leading-snug">
                                    {describeCardEvent(entry.entry)}
                                  </p>
                                ) : (
                                  <p className="text-sm leading-snug">
                                    <span className="font-medium">
                                      {entry.comment.authorName}
                                    </span>{" "}
                                    comentou: {entry.comment.body}
                                  </p>
                                )}
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {formatRelativeTime(entry.timestamp)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {activeTab === "anexos" && (
                    <section
                      aria-labelledby="card-attachments-title"
                      className="space-y-3"
                    >
                      <h3
                        id="card-attachments-title"
                        className="flex items-center gap-1.5 text-sm font-semibold"
                      >
                        <PaperclipIcon className="size-3.5" />
                        Anexos
                      </h3>

                      {cardAttachments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhum anexo neste card.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {cardAttachments.map((file) => (
                            <li key={file.id}>
                              <a
                                href={`/api/attachments/${file.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50"
                              >
                                <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate font-medium text-primary">
                                  {file.fileName}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatFileSize(file.sizeBytes)}
                                </span>
                              </a>
                              <p className="mt-0.5 pl-1 text-[0.6875rem] text-muted-foreground">
                                {file.fieldLabel}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {activeTab === "checklists" && (
                    <section
                      aria-labelledby="card-checklists-title"
                      className="space-y-3"
                    >
                      <h3
                        id="card-checklists-title"
                        className="flex items-center gap-1.5 text-sm font-semibold"
                      >
                        <ListChecksIcon className="size-3.5" />
                        Checklists
                      </h3>
                      <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                        Checklists ainda não estão disponíveis neste sistema.
                      </div>
                    </section>
                  )}

                  {activeTab === "comentarios" && (
                    <section
                      aria-labelledby="card-comments-title"
                      className="space-y-3"
                    >
                      <h3
                        id="card-comments-title"
                        className="flex items-center gap-1.5 text-sm font-semibold"
                      >
                        <MessageCircleIcon className="size-3.5" />
                        Comentários
                      </h3>

                      {commentsLoading && (
                        <div className="space-y-2">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-4/5" />
                        </div>
                      )}

                      {!commentsLoading && comments.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum comentário ainda.
                        </p>
                      )}

                      {!commentsLoading && comments.length > 0 && (
                        <div className="space-y-3">
                          {comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="flex items-start gap-2.5"
                            >
                              <Avatar size="sm">
                                {comment.authorAvatarUrl && (
                                  <AvatarImage
                                    src={comment.authorAvatarUrl}
                                    alt={comment.authorName}
                                  />
                                )}
                                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                  {getInitials(comment.authorName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold">
                                    {comment.authorName}
                                  </span>
                                  <span className="text-[0.625rem] text-muted-foreground">
                                    {formatDateTime(comment.createdAt)}
                                  </span>
                                </div>
                                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                                  {comment.body}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {onAddComment && (
                        <div className="space-y-2 pt-1">
                          {commentError && (
                            <Alert variant="destructive">
                              <CircleAlertIcon />
                              <AlertDescription>{commentError}</AlertDescription>
                            </Alert>
                          )}
                          <Textarea
                            value={commentBody}
                            onChange={(event) =>
                              setCommentBody(event.target.value)
                            }
                            placeholder="Escreva um comentário..."
                            rows={2}
                            disabled={submittingComment}
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              disabled={submittingComment || !commentBody.trim()}
                              onClick={handleSubmitComment}
                            >
                              {submittingComment ? (
                                <LoaderCircleIcon className="animate-spin" />
                              ) : (
                                <SendIcon />
                              )}
                              Comentar
                            </Button>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {activeTab === "email" && (
                    <section
                      aria-labelledby="card-emails-title"
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3
                          id="card-emails-title"
                          className="flex items-center gap-1.5 text-sm font-semibold"
                        >
                          <MailIcon className="size-3.5" />
                          Emails
                          {emails.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-4 min-w-4 px-1 text-[0.625rem]"
                            >
                              {emails.length}
                            </Badge>
                          )}
                        </h3>
                        {onSendEmail && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pendingAction !== null}
                            onClick={() => runAction("email", onSendEmail)}
                          >
                            {pendingAction === "email" ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : (
                              <SendIcon />
                            )}
                            Criar email
                          </Button>
                        )}
                      </div>

                      {emails.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum e-mail vinculado a este card.
                        </p>
                      )}

                      {emails.length > 0 && (
                        <div className="space-y-2.5">
                          {emails.map((email) => (
                            <div
                              key={email.id}
                              className="rounded-lg border p-3 text-sm"
                            >
                              <div className="flex items-start gap-2.5">
                                <Avatar size="sm">
                                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                    {getInitials(email.fromAddress ?? email.subject)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="truncate text-xs font-semibold">
                                      {email.fromAddress ?? "—"}
                                    </span>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      <span className="text-[0.625rem] text-muted-foreground">
                                        {formatRelativeTime(
                                          email.sentAt ?? email.createdAt
                                        )}
                                      </span>
                                      {email.isAutomated && (
                                        <Badge
                                          variant="secondary"
                                          className="gap-0.5 text-[0.625rem]"
                                        >
                                          <CheckIcon className="size-3" />
                                          Automatizado
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <p className="mt-0.5 font-medium leading-snug">
                                    {email.subject}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Para: {email.toAddresses.join(", ")}
                                  </p>
                                  {email.errorMessage && (
                                    <p className="mt-1 text-xs text-destructive">
                                      {email.errorMessage}
                                    </p>
                                  )}
                                  {!email.isAutomated && (
                                    <Badge
                                      variant="ghost"
                                      className={cn(
                                        "mt-1.5 border-0",
                                        emailStatusStyles[email.status]
                                      )}
                                    >
                                      {emailStatusLabels[email.status]}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto border-b px-4 py-5 lg:border-r lg:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Fase atual</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {currentPhase ? (
                    <Badge
                      className={cn(
                        "border-0",
                        phaseAccentStyles[currentPhase.accent ?? "neutral"]
                      )}
                    >
                      {currentPhase.title}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>

                <Separator className="my-4" />

                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Responsável
                </h3>

                {(card.assignees?.length ?? 0) > 0 ? (
                  <div className="mt-3 space-y-2.5">
                    {card.assignees?.map((assignee) => (
                      <div
                        key={assignee.id}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar size="sm">
                          {assignee.avatarUrl && (
                            <AvatarImage
                              src={assignee.avatarUrl}
                              alt={assignee.name}
                            />
                          )}
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {assignee.initials || getInitials(assignee.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {assignee.name}
                        </span>
                        {onUnassign && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={assigningUserId === assignee.id}
                            onClick={() => handleUnassign(assignee.id)}
                            aria-label={`Remover ${assignee.name} como responsável`}
                          >
                            {assigningUserId === assignee.id ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : (
                              <XIcon />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    <UserRoundIcon className="size-4" />
                    Sem responsável.
                  </div>
                )}

                {onAssign && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={unassignedMembers.length === 0}
                        className="mt-2 text-primary"
                      >
                        <PlusIcon />
                        Adicionar responsável
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {unassignedMembers.map((member) => (
                        <DropdownMenuItem
                          key={member.userId}
                          disabled={assigningUserId === member.userId}
                          onClick={() => handleAssign(member.userId)}
                        >
                          <UserRoundIcon />
                          {member.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <div className="relative min-h-0 overflow-y-auto bg-muted/20 px-4 py-5">
                <h3 className="mb-3 text-sm font-semibold">
                  Mover card para fase
                </h3>

                {moveError && (
                  <Alert variant="destructive" className="mb-3">
                    <CircleAlertIcon />
                    <AlertDescription>{moveError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  {otherPhases.map((phase) => (
                    <button
                      key={phase.id}
                      type="button"
                      disabled={!onMoveCard || movingPhaseId !== null}
                      onClick={() => handleMoveToPhase(phase)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        phaseAccentStyles[phase.accent ?? "neutral"],
                        onMoveCard && "hover:brightness-95"
                      )}
                    >
                      <span className="truncate">{phase.title}</span>
                      {movingPhaseId === phase.id ? (
                        <LoaderCircleIcon className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <ArrowRightIcon className="size-4 shrink-0" />
                      )}
                    </button>
                  ))}
                  {otherPhases.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Não há outras fases neste fluxo.
                    </p>
                  )}
                </div>

              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
