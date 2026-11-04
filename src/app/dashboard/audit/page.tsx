import React from "react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AuditLogsClient from "./AuditLogsClient";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const session = await getSession();

  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return (
    <AuditLogsClient
      initialLogs={logs}
      currentUserRole={session?.roleName || "Employee"}
    />
  );
}

