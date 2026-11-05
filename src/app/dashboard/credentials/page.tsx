import React from "react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AgentCredentialsClient from "./AgentCredentialsClient";

export const dynamic = "force-dynamic";

export default async function CredentialsPage() {
  const session = await getSession();

  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      rateLimit: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AgentCredentialsClient
      initialAgents={agents}
      currentUserRole={session?.roleName || "Employee"}
    />
  );
}

