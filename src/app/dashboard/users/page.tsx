import React from "react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import UserManagementClient from "./UserManagementClient";

export const dynamic = "force-dynamic";

export default async function UserManagementPage() {
  const session = await getSession();

  // Load users with their roles from SQLite
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      select: { id: true, name: true },
    }),
  ]);

  const canCreateUser = session?.permissions.includes("users.create") || false;

  return (
    <UserManagementClient
      initialUsers={users}
      availableRoles={roles}
      currentUserRole={session?.roleName || "Employee"}
      canCreateUser={canCreateUser}
    />
  );
}

