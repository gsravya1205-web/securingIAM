import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/m2m";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/resources/financial-reports
 * High-Risk Protected Demonstration Resource: Sensitive Financial & Treasury Reports.
 * If called by an AI Agent, requires active dual-control supervisory signoff on file.
 */
export async function GET(request: NextRequest) {
  const hasMachineAuth = Boolean(
    request.headers.get("authorization") || request.headers.get("x-api-key")
  );

  let callerName = "";
  let callerType: "USER" | "AGENT" = "USER";

  if (hasMachineAuth) {
    const auth = await authenticateMachineRequest(request, {
      requiredPermission: "reports.create",
      action: "RESOURCE_READ_FINANCIAL_REPORTS",
      resource: "Reports:SensitiveFinancial",
    });

    if (!auth.authorized) {
      return auth.response!;
    }

    callerName = auth.agent!.name;
    callerType = "AGENT";

    // Enforce dual-control signoff requirement for autonomous access to financial data
    const approvedSignoff = await prisma.approvalRequest.findFirst({
      where: {
        requesterType: "AGENT",
        requesterId: auth.agent!.id,
        targetAction: "reports.create",
        resource: "Reports:SensitiveFinancial",
        status: "APPROVED",
      },
    });

    if (!approvedSignoff) {
      // Record denied audit event
      await prisma.auditLog.create({
        data: {
          actorType: "AGENT",
          actorId: auth.agent!.id,
          actorName: auth.agent!.name,
          action: "FINANCIAL_ACCESS_APPROVAL_REQUIRED",
          resource: "Reports:SensitiveFinancial",
          status: "DENIED",
          details: `Blocked agent execution: Action on sensitive financial reports requires human-in-the-loop supervisor approval ticket.`,
          agentId: auth.agent!.id,
        },
      });

      return NextResponse.json(
        {
          error: "Supervisory Approval Required: Autonomous agent access to Sensitive Financial Reports requires a verified human approval ticket before execution.",
          verdict: "APPROVAL_REQUIRED",
          action: "reports.create",
          resource: "Reports:SensitiveFinancial",
        },
        { status: 403 }
      );
    }
  } else {
    const auth = await authorizeRequest({
      requiredPermission: "reports.create",
      action: "RESOURCE_READ_FINANCIAL_REPORTS",
      resource: "Reports:SensitiveFinancial",
    });

    if (!auth.authorized) {
      return auth.response!;
    }
    callerName = auth.session!.name;
    callerType = "USER";
  }

  // Safe synthetic demonstration data (No real financial assets)
  return NextResponse.json({
    success: true,
    resource: "Reports:SensitiveFinancial",
    caller: { name: callerName, type: callerType },
    data: {
      reportId: "FIN-AUDIT-2026-TREASURY",
      fiscalPeriod: "FY2026",
      treasuryBalance: "$45,200,000",
      operatingReserves: "$18,500,000",
      auditStatus: "RECONCILED",
      complianceSignoff: "Chief Financial Officer Verified",
      classification: "HIGHLY_RESTRICTED_FINANCIAL",
    },
  });
}

