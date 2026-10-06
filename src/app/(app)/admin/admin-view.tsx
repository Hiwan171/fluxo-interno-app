"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  PlusIcon,
} from "lucide-react";

import {
  createWorkspaceAction,
  setUserActiveAction,
  setUserSystemRoleAction,
} from "@/app/(app)/admin/actions";
import { AppLogo } from "@/components/app/app-logo";
import { CardFormDialog } from "@/components/app/card-form-dialog";
import type { FormSubmitResult } from "@/components/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  systemRole: "admin" | "user";
  isActive: boolean;
  lastLoginAt: string | null;
};

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  boardCount: number;
};

export interface AdminViewProps {
  users: AdminUserRow[];
  workspaces: AdminWorkspaceRow[];
  currentUserId: string;
}

const WORKSPACE_FORM_FIELDS = [
  {
    type: "text" as const,
    name: "name",
    label: "Nome",
    required: true,
    placeholder: "Ex.: Operações",
  },
  {
    type: "text" as const,
    name: "slug",
    label: "Slug (opcional)",
    placeholder: "Gerado a partir do nome se ficar em branco",
  },
];

function formatDate(value: string | null): string {
  if (!value) return "Nunca";

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function AdminView({
  users,
  workspaces,
  currentUserId,
}: AdminViewProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  async function run(
    userId: string,
    action: () => Promise<FormSubmitResult>,
    successMessage: string,
  ) {
    setError(null);
    setNotice(null);
    setPendingUserId(userId);

    try {
      const result = await action();

      if (result?.error) {
        setError(result.error);
      } else {
        setNotice(successMessage);
        router.refresh();
      }
    } catch {
      setError("Não foi possível concluir a operação.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function handleCreateWorkspace(
    formData: FormData,
  ): Promise<FormSubmitResult> {
    const result = await createWorkspaceAction(formData);

    if (result?.success) {
      setNotice("Espaço de trabalho criado.");
      router.refresh();
    }

    return result;
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6">
        <AppLogo compact />
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/">
            <ArrowLeftIcon />
            Voltar
          </Link>
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-4xl gap-6">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Administração
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Usuários e espaços de trabalho do sistema.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {notice && (
            <Alert>
              <CircleCheckIcon />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
              <CardDescription>
                Desativar uma conta encerra as sessões abertas dela na hora.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Último acesso</TableHead>
                      <TableHead className="text-right">Ativo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const isSelf = user.id === currentUserId;
                      const pending = pendingUserId === user.id;

                      return (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {user.name}
                                {isSelf && (
                                  <Badge
                                    variant="secondary"
                                    className="ml-2 align-middle"
                                  >
                                    você
                                  </Badge>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.systemRole}
                              disabled={isSelf || pending}
                              onValueChange={(value) =>
                                run(
                                  user.id,
                                  () =>
                                    setUserSystemRoleAction(
                                      user.id,
                                      value as "admin" | "user",
                                    ),
                                  "Papel atualizado.",
                                )
                              }
                            >
                              <SelectTrigger size="sm" className="w-40">
                                <SelectValue>
                                  {user.systemRole === "admin"
                                    ? "Administrador"
                                    : "Usuário"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="admin">
                                  Administrador
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(user.lastLoginAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {pending && (
                                <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
                              )}
                              <Switch
                                checked={user.isActive}
                                disabled={isSelf || pending}
                                aria-label={`Ativar ${user.name}`}
                                onCheckedChange={(checked) =>
                                  run(
                                    user.id,
                                    () => setUserActiveAction(user.id, checked),
                                    checked
                                      ? "Usuário ativado."
                                      : "Usuário desativado e sessões encerradas.",
                                  )
                                }
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Espaços de trabalho</CardTitle>
                <CardDescription>
                  Cada espaço isola quadros, cards e membros dos demais.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setCreatingWorkspace(true)}
              >
                <PlusIcon />
                Novo espaço
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Membros</TableHead>
                      <TableHead>Quadros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspaces.map((workspace) => (
                      <TableRow key={workspace.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{workspace.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {workspace.slug}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {workspace.memberCount}
                        </TableCell>
                        <TableCell className="text-sm">
                          {workspace.boardCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CardFormDialog
        open={creatingWorkspace}
        onOpenChange={setCreatingWorkspace}
        fields={WORKSPACE_FORM_FIELDS}
        submitAction={handleCreateWorkspace}
        title="Novo espaço de trabalho"
        description="Você entra como proprietário e pode adicionar outras pessoas depois."
        submitLabel="Criar espaço"
      />
    </>
  );
}
