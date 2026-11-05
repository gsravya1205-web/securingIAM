import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/m2m";
import { authorizeRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/resources/sales-reports
 * Protected Demonstration Resource: Sales & Revenue Telemetry.
 * Requires permission 'reports.read' scoped to 'Reports:Sales'.
 */
export async function GET(request: NextRequest) {
  const hasMachineAuth = Boolean(
    request.headers.get("authorization") || request.headers.get("x-api-key")
  );

  let callerName = "";
  let callerType: "USER" | "AGENT" = "USER";

  if (hasMachineAuth) {
    const auth = await authenticateMachineRequest(request, {
      requiredPermission: "reports.read",
      action: "RESOURCE_READ_SALES_REPORTS",
      resource: "Reports:Sales",
    });

    if (!auth.authorized) {
      return auth.response!;
    }

    // Sales reports is a restricted scoped domain requiring active delegated authorization for AI agents
    if (!auth.agent!.delegatedAuthUsed || (auth.agent!.delegatedAuthUsed.scope !== "Reports:Sales" && auth.agent!.delegatedAuthUsed.scope !== "Global")) {
      return NextResponse.json(
        { error: "Access Denied: Scoped resource 'Reports:Sales' requires active human delegation grant." },
        { status: 403 }
      );
    }

    callerName = auth.agent!.name;
    callerType = "AGENT";
  } else {
    const auth = await authorizeRequest({
      requiredPermission: "reports.read",
      action: "RESOURCE_READ_SALES_REPORTS",
      resource: "Reports:Sales",
    });

    if (!auth.authorized) {
      return auth.response!;
    }
    callerName = auth.session!.name;
    callerType = "USER";
  }

  // Safe synthetic demonstration data
  return NextResponse.json({
    success: true,
    resource: "Reports:Sales",
    caller: { name: callerName, type: callerType },
    data: {
      reportId: "REP-SALES-2026-Q3",
      title: "Enterprise Regional Sales Pipeline & ARR Growth",
      period: "Q3 2026",
      revenueTotal: "$12,450,000",
      topRegions: [
        { region: "North America", arr: "$6,200,000", growth: "+18%" },
        { region: "EMEA", arr: "$4,100,000", growth: "+22%" },
        { region: "APAC", arr: "$2,150,000", growth: "+31%" },
      ],
      classification: "CONFIDENTIAL",
    },
  });
}
