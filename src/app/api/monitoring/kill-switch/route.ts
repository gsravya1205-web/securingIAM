import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

// POST /api/monitoring/kill-switch -> Trigger or deactivate emergency circuit-breaker
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "agents.manage",
    action: "EMERGENCY_KILLSWITCH_EXEC",
    resource: "Security:KillSwitch",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "ACTIVATE"; // "ACTIVATE" or "DEACTIVATE"

    if (action === "ACTIVATE") {
      const updateResult = await prisma.agent.updateMany({
        where: { status: "ACTIVE" },
        data: { status: "SUSPENDED" },
      });

      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: auth.session!.id,
          actorName: auth.session!.name,
          action: "EMERGENCY_KILLSWITCH_ACTIVATED",
          resource: "Agents:AllGateways",
          status: "SUCCESS",
          details: `Emergency kill-switch triggered by [${auth.session!.name}]. Suspended ${updateResult.count} active machine agent identities across all clusters.`,
          userId: auth.session!.id,
        },
      });

      return NextResponse.json({
        success: true,
        action: "ACTIVATED",
        suspendedCount: updateResult.count,
        message: `Emergency lockdown engaged. ${updateResult.count} agents suspended.`,
      });
    } else {
      const updateResult = await prisma.agent.updateMany({
        where: { status: "SUSPENDED" },
        data: { status: "ACTIVE" },
      });

      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: auth.session!.id,
          actorName: auth.session!.name,
          action: "EMERGENCY_KILLSWITCH_DEACTIVATED",
          resource: "Agents:AllGateways",
          status: "SUCCESS",
          details: `Emergency lockdown lifted by [${auth.session!.name}]. Restored ${updateResult.count} agents to ACTIVE status.`,
          userId: auth.session!.id,
        },
      });

      return NextResponse.json({
        success: true,
        action: "DEACTIVATED",
        restoredCount: updateResult.count,
        reactivatedCount: updateResult.count,
        message: `Emergency lockdown lifted. ${updateResult.count} agents restored to active service.`,
      });
    }
  } catch (error: unknown) {
    console.error("Kill-switch execution error:", error);
    return NextResponse.json(
      { error: "Internal error executing emergency kill-switch command." },
      { status: 500 }
    );
  }
}

