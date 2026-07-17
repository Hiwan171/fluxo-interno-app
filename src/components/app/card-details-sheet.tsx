"use client"

import { useState } from "react"
import {
  CalendarDaysIcon,
  CheckSquare2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  SendIcon,
  UserRoundIcon,
} from "lucide-react"

import type {
  CommentDTO,
  CustomFieldDTO,
  EmailMessageDTO,
  KanbanCardDTO,
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
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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

  if (type === "select" && options) {
    return options.find((option) => option.value === value)?.label ?? String(value)
  }

  if (type === "date" || type === "datetime") {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : formatDate(date.toISOString())
  }

  return String(value)
}

export interface CardDetailsSheetProps {
  card: KanbanCardDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (cardId: string) => void | Promise<void>
  onSendEmail?: (cardId: string) => void | Promise<void>
  customFields?: CustomFieldDTO[]
  comments?: CommentDTO[]
  commentsLoading?: boolean
  onAddComment?: (body: string) => Promise<{ error?: string } | void>
  emails?: EmailMessageDTO[]
}

export function CardDetailsSheet({
  card,
  open,
  onOpenChange,
  onEdit,
  onSendEmail,
  customFields = [],
  comments = [],
  commentsLoading = false,
  onAddComment,
  emails = [],
}: CardDetailsSheetProps) {
  const [pendingAction, setPendingAction] = useState<"edit" | "email" | null>(
    null
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

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

  const checklistPercentage = card?.checklist?.total
    ? Math.round((card.checklist.completed / card.checklist.total) * 100)
    : 0

  const cardCustomFields = card
    ? customFields.map((field) => ({
        field,
        value: card.customFieldValues?.[field.id],
      }))
    : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(42rem,100vw)] gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b px-5 py-4 pr-14 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {card?.reference && (
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {card.reference}
              </span>
            )}
            {card?.priority && (
              <Badge
                variant="ghost"
                className={cn("border-0", priorityStyles[card.priority])}
              >
                {priorityLabels[card.priority]}
              </Badge>
            )}
          </div>
          <SheetTitle className="text-lg leading-snug">
            {card?.title ?? "Detalhes do card"}
          </SheetTitle>
          <SheetDescription>
            {card
              ? "Consulte as informações e execute as próximas ações."
              : "Carregando informações do card."}
          </SheetDescription>
        </SheetHeader>

        {!card ? (
          <div className="flex-1 space-y-6 overflow-hidden p-5">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {actionError && (
              <Alert variant="destructive" className="mb-5">
                <CircleAlertIcon />
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              <section aria-labelledby="card-description-title">
                <h3
                  id="card-description-title"
                  className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Descrição
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {card.description || "Nenhuma descrição informada."}
                </p>
              </section>

              {(card.tags?.length ?? 0) > 0 && (
                <section aria-labelledby="card-tags-title">
                  <h3
                    id="card-tags-title"
                    className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    Marcadores
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {card.tags?.map((tag) => (
                      <Badge key={tag.id} variant="secondary">
                        {tag.label}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <Separator />

              <section
                aria-labelledby="card-information-title"
                className="space-y-4"
              >
                <h3
                  id="card-information-title"
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Informações
                </h3>
                {card.dueDate && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <CalendarDaysIcon className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">Prazo</p>
                      <p className="font-medium">{formatDate(card.dueDate)}</p>
                    </div>
                  </div>
                )}
                {typeof card.emailCount === "number" && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <MailIcon className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Comunicações
                      </p>
                      <p className="font-medium">
                        {card.emailCount} e-mail
                        {card.emailCount === 1 ? "" : "s"} vinculado
                        {card.emailCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                )}
                {card.checklist && card.checklist.total > 0 && (
                  <div className="flex items-start gap-3 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <CheckSquare2Icon className="size-4" />
                    </span>
                    <div className="flex-1 pt-0.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">Progresso</p>
                        <span className="font-mono text-xs text-muted-foreground">
                          {card.checklist.completed}/{card.checklist.total}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${checklistPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {(card.assignees?.length ?? 0) > 0 && (
                <>
                  <Separator />
                  <section aria-labelledby="card-assignees-title">
                    <h3
                      id="card-assignees-title"
                      className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      Responsáveis
                    </h3>
                    <div className="space-y-2.5">
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
                          <span className="text-sm font-medium">
                            {assignee.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {(card.assignees?.length ?? 0) === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  <UserRoundIcon className="size-4" />
                  Este card ainda não tem responsável.
                </div>
              )}

              {cardCustomFields.length > 0 && (
                <>
                  <Separator />
                  <section
                    aria-labelledby="card-custom-fields-title"
                    className="space-y-3"
                  >
                    <h3
                      id="card-custom-fields-title"
                      className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      Campos personalizados
                    </h3>
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {cardCustomFields.map(({ field, value }) => (
                        <div key={field.id}>
                          <dt className="text-xs text-muted-foreground">
                            {field.label}
                          </dt>
                          <dd className="text-sm font-medium">
                            {formatFieldValue(field.type, value, field.options)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </>
              )}

              {emails.length > 0 && (
                <>
                  <Separator />
                  <section
                    aria-labelledby="card-emails-title"
                    className="space-y-3"
                  >
                    <h3
                      id="card-emails-title"
                      className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      E-mails
                    </h3>
                    <div className="space-y-2.5">
                      {emails.map((email) => (
                        <div
                          key={email.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium leading-snug">
                              {email.subject}
                            </p>
                            <Badge
                              variant="ghost"
                              className={cn(
                                "shrink-0 border-0",
                                emailStatusStyles[email.status]
                              )}
                            >
                              {emailStatusLabels[email.status]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Para: {email.toAddresses.join(", ")}
                          </p>
                          {email.errorMessage && (
                            <p className="mt-1 text-xs text-destructive">
                              {email.errorMessage}
                            </p>
                          )}
                          <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                            {formatDateTime(email.sentAt ?? email.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              <Separator />

              <section
                aria-labelledby="card-comments-title"
                className="space-y-3"
              >
                <h3
                  id="card-comments-title"
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
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
                      <div key={comment.id} className="flex items-start gap-2.5">
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
                      onChange={(event) => setCommentBody(event.target.value)}
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
            </div>
          </div>
        )}

        {card && (onEdit || onSendEmail) && (
          <SheetFooter className="flex-row justify-end border-t bg-muted/30 px-5 py-4">
            {onSendEmail && (
              <Button
                type="button"
                variant="outline"
                disabled={pendingAction !== null}
                onClick={() => runAction("email", onSendEmail)}
              >
                {pendingAction === "email" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <MailIcon />
                )}
                Enviar e-mail
              </Button>
            )}
            {onEdit && (
              <Button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => runAction("edit", onEdit)}
              >
                {pendingAction === "edit" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <PencilIcon />
                )}
                Editar
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
