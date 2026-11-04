import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardHeader from "@/components/DashboardHeader";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
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
