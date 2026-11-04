import React from "react";
import { prisma } from "@/lib/prisma";
import SecurityMonitoringClient from "./SecurityMonitoringClient";

export const dynamic = "force-dynamic";

export default async function SecurityMonitoringPage() {
  const [failedLogins, deniedEvents, recentViolations, agentsCount] =
    await Promise.all([
      prisma.auditLog.count({
        where: { action: "AUTH_LOGIN_FAILED" },
      }),
      prisma.auditLog.count({
        where: { status: "DENIED" },
      }),
      prisma.auditLog.findMany({
        where: { status: "DENIED" },
        take: 10,
        orderBy: { timestamp: "desc" },
      }),
      prisma.agent.count(),
    ]);

  return (
    <SecurityMonitoringClient
      failedLogins={failedLogins}
      deniedEvents={deniedEvents}
      recentViolations={recentViolations}
      agentsCount={agentsCount}
    />
  );
}

