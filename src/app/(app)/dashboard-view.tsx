"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDownIcon,
  LockIcon,
  PlusIcon,
} from "lucide-react";

import { createBoardAction } from "@/app/(app)/actions";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import { DashboardHeader } from "@/components/app/dashboard-header";
import { PHASE_COLOR_PALETTE } from "@/components/app/phase-colors";
import { getIconComponent, ICON_PALETTE } from "@/components/app/phase-icons";
import type {
  AppUserDTO,
  FormFieldDTO,
  FormSubmitResult,
} from "@/components/app/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const CREATE_BOARD_FIELDS: FormFieldDTO[] = [
  {
    type: "text",
    name: "name",
    label: "Nome do quadro",
    required: true,
    placeholder: "Ex.: Solicitações de TI",
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
    type: "icon",
    name: "icon",
    label: "Ícone",
    options: ICON_PALETTE.map((option) => ({
      label: option.label,
      value: option.value,
    })),
  },
];

const VISIBLE_BOARD_LIMIT = 7;

export interface DashboardBoard {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  visibility: "workspace" | "private";
  cardCount: number;
}

export interface DashboardViewProps {
  workspaceId: string;
  workspaceName: string;
  workspaces?: Array<{ id: string; name: string; slug: string }>;
  isSystemAdmin?: boolean;
  user: AppUserDTO;
  signOutAction: () => void | Promise<void>;
  boards: DashboardBoard[];
  canCreateBoard: boolean;
}

export function DashboardView({
  workspaceId,
  workspaceName,
  workspaces = [],
  isSystemAdmin = false,
  user,
  signOutAction,
  boards,
  canCreateBoard,
}: DashboardViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const filteredBoards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return boards;
    return boards.filter((board) =>
      board.name.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [boards, search]);

  const visibleBoards =
    showAll || filteredBoards.length <= VISIBLE_BOARD_LIMIT + 1
      ? filteredBoards
      : filteredBoards.slice(0, VISIBLE_BOARD_LIMIT);

  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;

  async function handleCreateBoard(formData: FormData): Promise<FormSubmitResult> {
    const result = await createBoardAction(workspaceId, formData);

    if (result.success && result.boardId) {
      router.push(`/boards/${result.boardId}`);
    }

    return result;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardHeader
        workspaceName={workspaceName}
        workspaces={workspaces}
        isSystemAdmin={isSystemAdmin}
        user={user}
        signOutAction={signOutAction}
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--workspace)]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                {firstName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h1 className="font-heading text-lg font-semibold tracking-[-0.01em] sm:text-xl">
              {firstName}, vamos turbinar o próximo processo
            </h1>
          </div>

          <div className="mt-8 flex items-center gap-4 border-b">
            <span className="border-b-2 border-primary pb-2.5 text-sm font-semibold text-primary">
              Quadros
            </span>
            <span className="cursor-not-allowed border-b-2 border-transparent pb-2.5 text-sm font-medium text-muted-foreground/50">
              Bases de dados
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {canCreateBoard && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <PlusIcon className="size-5" />
                Criar quadro
              </button>
            )}

            {visibleBoards.map((board) => {
              const BoardIcon = getIconComponent(board.icon);
              return (
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className="flex min-h-32 flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-white"
                  style={{ backgroundColor: board.color }}
                >
                  <BoardIcon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">
                    {board.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {board.cardCount} cards
                    {board.visibility === "private" && (
                      <LockIcon className="size-3" />
                    )}
                  </p>
                </div>
              </Link>
              );
            })}
          </div>

          {!showAll && filteredBoards.length > VISIBLE_BOARD_LIMIT + 1 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary"
            >
              <ChevronDownIcon className="size-4" />
              Mostrar mais quadros
            </button>
          )}
        </div>
      </div>

      <CardFormDialog
        open={creating}
        onOpenChange={setCreating}
        fields={CREATE_BOARD_FIELDS}
        submitAction={handleCreateBoard}
        title="Criar quadro"
        description="Dê um nome e uma cor para o novo quadro. Ele começa com as etapas Novo e Concluído."
        submitLabel="Criar quadro"
      />
    </div>
  );
}
