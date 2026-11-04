import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

// GET /api/audit -> Requires audit.read (Admin, Manager allowed; Employee denied)
export async function GET() {
  const auth = await authorizeRequest({
    requiredPermission: "audit.read",
    action: "AUDIT_LOG_READ",
    resource: "Audit:Logs",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  const logs = await prisma.auditLog.findMany({
    take: 50,
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json({ success: true, count: logs.length, logs });
}

