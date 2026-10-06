import { signOutAction } from "@/app/(app)/actions";
import { DashboardView } from "@/app/(app)/dashboard-view";
import { AppLogo } from "@/components/app/app-logo";
import { EmptyState } from "@/components/app/empty-state";
import { getCurrentSession } from "@/lib/auth";
import { listWorkspaceBoards, listWorkspacesForCurrentUser } from "@/lib/dal";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const session = await getCurrentSession();
  const [workspaces, { workspace: requestedSlug }] = await Promise.all([
    listWorkspacesForCurrentUser(),
    searchParams,
  ]);

  if (!session) {
    return null;
  }

  // O espaço escolhido vem da URL, para sobreviver a um recarregamento e poder
  // ser compartilhado. Antes só o primeiro da lista era alcançável.
  const workspace =
    workspaces.find((item) => item.slug === requestedSlug) ?? workspaces[0];

  if (!workspace) {
    return (
      <>
        <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 sm:px-6">
          <AppLogo />
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <EmptyState
            icon="inbox"
            title="Nenhum espaço de trabalho"
            description="Você ainda não tem acesso a nenhum espaço de trabalho."
          />
        </div>
      </>
    );
  }

  const boards = await listWorkspaceBoards(workspace.id);
  const canCreateBoard =
    session.user.systemRole === "admin" ||
    workspace.role === "owner" ||
    workspace.role === "admin";

  return (
    <DashboardView
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      workspaces={workspaces.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
      }))}
      isSystemAdmin={session.user.systemRole === "admin"}
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl,
        role: session.user.systemRole,
      }}
      signOutAction={signOutAction}
      boards={boards.map((board) => ({
        id: board.id,
        name: board.name,
        color: board.color,
        icon: board.icon,
        visibility: board.visibility,
        cardCount: board.cardCount,
      }))}
      canCreateBoard={canCreateBoard}
    />
  );
}
