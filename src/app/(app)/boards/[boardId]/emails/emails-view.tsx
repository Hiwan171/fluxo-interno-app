"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BookmarkIcon,
  CircleAlertIcon,
  CircleDotIcon,
  InboxIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  SendIcon,
  SettingsIcon,
  UserRoundIcon,
  UserXIcon,
  ZapIcon,
} from "lucide-react";

import { addCommentAction, moveCardAction } from "@/app/(app)/boards/[boardId]/actions";
import { markEmailReadAction } from "@/app/(app)/boards/[boardId]/emails/actions";
import { PipeHeader } from "@/components/app/pipe-header";
import type { AppUserDTO, EmailMessageDTO, KanbanColumnDTO } from "@/components/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const emailStatusLabels: Record<EmailMessageDTO["status"], string> = {
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const emailStatusStyles: Record<EmailMessageDTO["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  sending: "bg-tag-blue/10 text-tag-blue",
  sent: "bg-priority-low/10 text-priority-low",
  failed: "bg-priority-urgent/10 text-priority-urgent",
  cancelled: "bg-muted text-muted-foreground",
};

const phaseAccentStyles: Record<NonNullable<KanbanColumnDTO["accent"]>, string> = {
  neutral: "bg-muted-foreground/10 text-muted-foreground",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  red: "bg-red-600/10 text-red-600 dark:text-red-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  purple: "bg-purple-600/10 text-purple-600 dark:text-purple-400",
  lime: "bg-lime-600/10 text-lime-700 dark:text-lime-400",
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

export interface EmailRowDTO {
  id: string;
  status: EmailMessageDTO["status"];
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  textBody: string | null;
  errorMessage?: string | null;
  sentAt: string | null;
  createdAt: string;
  readAt: string | null;
  cardId: string;
  cardReference: string;
  cardTitle: string;
  cardPhaseId: string;
  requesterName: string | null;
  requesterEmail: string | null;
  assigneeUserIds: string[];
}

export interface EmailsPhaseDTO {
  id: string;
  title: string;
  accent?: KanbanColumnDTO["accent"];
}

export interface EmailsViewProps {
  boardId: string;
  boardName: string;
  workspaceName: string;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  phases: EmailsPhaseDTO[];
  emails: EmailRowDTO[];
}

type InboxFilter = "all" | "unread" | "mine" | "unassigned";

export function EmailsView({
  boardId,
  boardName,
  workspaceName,
  user,
  signOutAction,
  phases,
  emails,
}: EmailsViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(
    emails[0]?.id ?? null,
  );
  const [readEmailIds, setReadEmailIds] = useState<Set<string>>(new Set());
  const [movingPhaseId, setMovingPhaseId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentFeedback, setCommentFeedback] = useState<string | null>(null);

  function isRead(email: EmailRowDTO) {
    return Boolean(email.readAt) || readEmailIds.has(email.id);
  }

  const unreadCount = emails.filter((email) => !isRead(email)).length;

  const filteredEmails = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return emails.filter((email) => {
      if (inboxFilter === "unread" && isRead(email)) return false;
      if (inboxFilter === "mine" && !email.assigneeUserIds.includes(user.id)) {
        return false;
      }
      if (inboxFilter === "unassigned" && email.assigneeUserIds.length > 0) {
        return false;
      }
      if (!query) return true;
      return [
        email.subject,
        email.cardTitle,
        email.requesterName ?? "",
        email.requesterEmail ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, search, inboxFilter, readEmailIds, user.id]);

  const selectedEmail =
    filteredEmails.find((email) => email.id === selectedEmailId) ??
    filteredEmails[0] ??
    null;

  const currentPhase = selectedEmail
    ? phases.find((phase) => phase.id === selectedEmail.cardPhaseId)
    : undefined;
  const otherPhases = selectedEmail
    ? phases.filter((phase) => phase.id !== selectedEmail.cardPhaseId)
    : [];

  function selectEmail(id: string) {
    setSelectedEmailId(id);
    setMoveError(null);
    setCommentBody("");
    setCommentFeedback(null);

    const email = emails.find((item) => item.id === id);
    if (email && !isRead(email)) {
      setReadEmailIds((prev) => new Set(prev).add(id));
      markEmailReadAction(id).catch(() => {
        setReadEmailIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
  }

  async function handleMoveToPhase(target: EmailsPhaseDTO) {
    if (!selectedEmail || movingPhaseId) return;

    setMovingPhaseId(target.id);
    setMoveError(null);
    try {
      await moveCardAction(boardId, {
        cardId: selectedEmail.cardId,
        destinationPhaseId: target.id,
        position: 0,
      });
      router.refresh();
    } catch {
      setMoveError("Não foi possível mover o card agora.");
    } finally {
      setMovingPhaseId(null);
    }
  }

  async function handleSubmitComment() {
    if (!selectedEmail || !commentBody.trim()) return;

    setSubmittingComment(true);
    setCommentFeedback(null);
    try {
      const formData = new FormData();
      formData.set("body", commentBody.trim());
      const result = await addCommentAction(boardId, selectedEmail.cardId, formData);
      if (result.error) {
        setCommentFeedback(result.error);
        return;
      }
      setCommentBody("");
      setCommentFeedback("Comentário adicionado.");
    } catch {
      setCommentFeedback("Não foi possível adicionar o comentário.");
    } finally {
      setSubmittingComment(false);
    }
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
        activeTab="emails"
      />

      <div className="flex min-h-0 flex-1 bg-[var(--workspace)]">
        <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-background p-3 md:flex">
          <nav className="space-y-0.5 text-sm">
            <button
              type="button"
              onClick={() => setInboxFilter("all")}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium transition-colors hover:bg-muted/50",
                inboxFilter === "all" && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              <InboxIcon className="size-4" />
              Todas as mensagens
              <Badge variant="secondary" className="ml-auto">
                {emails.length}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter("unread")}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/50",
                inboxFilter === "unread" && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              <CircleDotIcon className="size-4" />
              Mensagens não lidas
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {unreadCount}
                </Badge>
              )}
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter("mine")}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/50",
                inboxFilter === "mine" && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              <UserRoundIcon className="size-4" />
              Atribuídas a mim
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter("unassigned")}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/50",
                inboxFilter === "unassigned" && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              <UserXIcon className="size-4" />
              Sem responsável
            </button>
          </nav>

          <div className="h-px bg-border" />

          <nav className="space-y-0.5 text-sm">
            <Link
              href={`/boards/${boardId}/emails/automations`}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <ZapIcon className="size-4" />
              Automações de email
            </Link>
            <Link
              href={`/boards/${boardId}/emails/templates`}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <BookmarkIcon className="size-4" />
              Templates de email
            </Link>
            <Link
              href={`/boards/${boardId}/manage?tab=email`}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <SettingsIcon className="size-4" />
              Configurações de e-mail
            </Link>
          </nav>
        </aside>

        <div className="flex w-full max-w-sm shrink-0 flex-col border-r bg-background">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
            <span className="text-sm font-semibold">Mensagens</span>
            <span className="text-xs text-muted-foreground">
              {filteredEmails.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredEmails.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Nenhum e-mail encontrado.
              </p>
            )}
            {filteredEmails.map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => selectEmail(email.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b px-3.5 py-3 text-left transition-colors hover:bg-muted/50",
                  selectedEmail?.id === email.id && "bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
                    {!isRead(email) && (
                      <span
                        aria-label="Não lida"
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                      />
                    )}
                    <span className="truncate">
                      {email.requesterName || email.requesterEmail || "Solicitante"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                    {formatDateTime(email.sentAt ?? email.createdAt)}
                  </span>
                </div>
                <p
                  className={cn(
                    "truncate text-sm",
                    isRead(email) ? "text-foreground/70" : "font-medium text-foreground",
                  )}
                >
                  {email.subject}
                </p>
                <span className="inline-flex w-fit items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                  {email.cardReference} {email.cardTitle}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!selectedEmail ? (
            <div className="grid h-full place-items-center p-10 text-center text-sm text-muted-foreground">
              {emails.length === 0
                ? "Nenhum e-mail neste quadro ainda."
                : "Nenhum e-mail corresponde à busca."}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-6 py-6">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-base font-semibold">
                  {selectedEmail.subject}
                </h1>
                <Badge
                  variant="ghost"
                  className={cn("border-0", emailStatusStyles[selectedEmail.status])}
                >
                  {emailStatusLabels[selectedEmail.status]}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  De: {selectedEmail.fromAddress} · Para:{" "}
                  {selectedEmail.toAddresses.join(", ")}
                </span>
                <span>{formatDateTime(selectedEmail.sentAt ?? selectedEmail.createdAt)}</span>
              </div>

              {selectedEmail.errorMessage && (
                <Alert variant="destructive" className="mt-4">
                  <CircleAlertIcon />
                  <AlertDescription>{selectedEmail.errorMessage}</AlertDescription>
                </Alert>
              )}

              <div className="mt-4 whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-relaxed">
                {selectedEmail.textBody || "Sem conteúdo."}
              </div>

            </div>
          )}
        </div>

        {selectedEmail && (
          <aside className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-background p-4 lg:flex">
            <div className="flex items-center gap-2 text-muted-foreground">
              <PaperclipIcon className="size-3.5 shrink-0" />
              <p className="truncate text-sm font-medium text-foreground">
                {selectedEmail.cardReference} {selectedEmail.cardTitle}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Fase atual
              </p>
              <div className="mt-1.5">
                {currentPhase ? (
                  <Badge
                    className={cn(
                      "border-0",
                      phaseAccentStyles[currentPhase.accent ?? "neutral"],
                    )}
                  >
                    {currentPhase.title}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Mover a fase
              </p>

              {moveError && (
                <Alert variant="destructive" className="mt-2">
                  <CircleAlertIcon />
                  <AlertDescription>{moveError}</AlertDescription>
                </Alert>
              )}

              <div className="mt-2 space-y-1.5">
                {otherPhases.map((phase) => (
                  <button
                    key={phase.id}
                    type="button"
                    disabled={movingPhaseId !== null}
                    onClick={() => handleMoveToPhase(phase)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60",
                      phaseAccentStyles[phase.accent ?? "neutral"],
                    )}
                  >
                    <span className="truncate">{phase.title}</span>
                    {movingPhaseId === phase.id ? (
                      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
                    ) : (
                      <ArrowRightIcon className="size-3.5 shrink-0" />
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

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Comentários
              </p>
              <div className="mt-2 space-y-2">
                {commentFeedback && (
                  <p className="text-xs text-muted-foreground">{commentFeedback}</p>
                )}
                <Textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Escreva seu comentário aqui"
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
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
