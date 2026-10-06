import { notFound } from "next/navigation";

import { AdminView } from "@/app/(app)/admin/admin-view";
import { getCurrentSession } from "@/lib/auth";
import {
  AuthorizationError,
  listAllWorkspacesForCurrentUser,
  listSystemUsersForCurrentUser,
} from "@/lib/dal";

export default async function AdminPage() {
  const session = await getCurrentSession();

  if (!session) {
    notFound();
  }

  let users: Awaited<ReturnType<typeof listSystemUsersForCurrentUser>>;
  let workspaces: Awaited<ReturnType<typeof listAllWorkspacesForCurrentUser>>;

  try {
    [users, workspaces] = await Promise.all([
      listSystemUsersForCurrentUser(),
      listAllWorkspacesForCurrentUser(),
    ]);
  } catch (error) {
    // Quem não é administrador não deve nem saber que esta rota existe.
    if (error instanceof AuthorizationError) {
      notFound();
    }
    throw error;
  }

  return (
    <AdminView
      currentUserId={session.userId}
      users={users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        systemRole: user.systemRole,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      }))}
      workspaces={workspaces}
    />
  );
}
