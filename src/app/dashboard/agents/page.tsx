import React from "react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AgentRegistryClient from "./AgentRegistryClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getSession();

  const agents = await prisma.agent.findMany({
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AgentRegistryClient
      initialAgents={agents}
      currentUserRole={session?.roleName || "Employee"}
    />
  );
}

