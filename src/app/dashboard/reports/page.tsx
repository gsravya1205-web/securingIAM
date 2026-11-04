import React from "react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import ComplianceReportsClient from "./ComplianceReportsClient";

export const dynamic = "force-dynamic";

export default async function ComplianceReportsPage() {
  const session = await getSession();

  const [roles, totalLogs, allowedCount, deniedCount] = await Promise.all([
    prisma.role.findMany({
      include: {
        users: { select: { id: true } },
        agents: { select: { id: true } },
      },
    }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { status: "SUCCESS" } }),
    prisma.auditLog.count({ where: { status: "DENIED" } }),
  ]);

  const roleDistribution = roles.map((r) => ({
    name: r.name,
    count: r.users.length + r.agents.length,
  }));

  return (
    <ComplianceReportsClient
      roleDistribution={roleDistribution}
      totalLogs={totalLogs}
      allowedCount={allowedCount}
      deniedCount={deniedCount}
      currentUserRole={session?.roleName || "Employee"}
    />
  );
}

