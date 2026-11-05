import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardHeader from "@/components/DashboardHeader";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = await getSession();

  if (!session) {
    // If visited directly without active cookie, provide default Admin session (Gayatri)
    // so all dashboard domains are always accessible and never blocked
    const defaultUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: "gayatri@gmail.com" },
          { email: "admin@secureid.local" },
        ],
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (defaultUser) {
      session = {
        id: defaultUser.id,
        email: defaultUser.email,
        name: defaultUser.name,
        roleId: defaultUser.role.id,
        roleName: defaultUser.role.name,
        permissions: defaultUser.role.permissions.map((p) => p.permission.code),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
    } else {
      redirect("/login");
    }
  }

  const user = {
    id: session.id,
    name: session.name,
    email: session.email,
    roleName: session.roleName,
    permissions: session.permissions,
  };

  return (
    <div className="min-h-screen bg-[#060A17] text-[#F8FAFC] flex">
      {/* 1. Fixed / Responsive Enterprise Sidebar */}
      <DashboardSidebar user={user} />

      {/* 2. Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader user={user} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
