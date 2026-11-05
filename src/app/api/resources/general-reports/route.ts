import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/m2m";
import { authorizeRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/resources/general-reports
 * Protected Demonstration Resource: General Analytics Reports.
 * Requires permission 'reports.read'. Accessible to human users with reports.read and agents with reports.read.
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
      action: "RESOURCE_READ_GENERAL_REPORTS",
      resource: "Reports:General",
    });

    if (!auth.authorized) {
      return auth.response!;
    }
    callerName = auth.agent!.name;
    callerType = "AGENT";
  } else {
    const auth = await authorizeRequest({
      requiredPermission: "reports.read",
      action: "RESOURCE_READ_GENERAL_REPORTS",
      resource: "Reports:General",
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
    resource: "Reports:General",
    caller: { name: callerName, type: callerType },
    data: {
      reportId: "REP-GEN-2026-Q3",
      title: "Quarterly Platform Performance & Utilization Metrics",
      generatedAt: new Date().toISOString(),
      metrics: {
        activeWorkspaces: 142,
        throughputEvents: "4.8M ops/sec",
        p99Latency: "14.2ms",
        apiUptime: "99.98%",
      },
      classification: "INTERNAL_USE_ONLY",
    },
  });
}

