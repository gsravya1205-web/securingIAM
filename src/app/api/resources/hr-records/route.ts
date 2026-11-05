import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/m2m";
import { authorizeRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/resources/hr-records
 * Protected Demonstration Resource: Personnel & HR Records.
 * Requires permission 'users.read' scoped to 'Records:HR'.
 */
export async function GET(request: NextRequest) {
  const hasMachineAuth = Boolean(
    request.headers.get("authorization") || request.headers.get("x-api-key")
  );

  let callerName = "";
  let callerType: "USER" | "AGENT" = "USER";

  if (hasMachineAuth) {
    const auth = await authenticateMachineRequest(request, {
      requiredPermission: "users.read",
      action: "RESOURCE_READ_HR_RECORDS",
      resource: "Records:HR",
    });

    if (!auth.authorized) {
      return auth.response!;
    }
    callerName = auth.agent!.name;
    callerType = "AGENT";
  } else {
    const auth = await authorizeRequest({
      requiredPermission: "users.read",
      action: "RESOURCE_READ_HR_RECORDS",
      resource: "Records:HR",
    });

    if (!auth.authorized) {
      return auth.response!;
    }
    callerName = auth.session!.name;
    callerType = "USER";
  }

  // Safe synthetic demonstration data (No real PII)
  return NextResponse.json({
    success: true,
    resource: "Records:HR",
    caller: { name: callerName, type: callerType },
    data: {
      headcountTotal: 480,
      activeContractors: 35,
      openRequisitions: 14,
      departments: [
        { department: "Engineering", count: 210, lead: "Engineering VP" },
        { department: "Security & IAM", count: 28, lead: "Chief Information Security Officer" },
        { department: "Operations", count: 74, lead: "Operations Director" },
      ],
      classification: "RESTRICTED_PII",
    },
  });
}

