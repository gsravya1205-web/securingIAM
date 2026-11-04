import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/m2m";
import { prisma } from "@/lib/prisma";

/**
 * Autonomous AI Agent Runtime Execution Engine.
 * Provides a secure machine-to-machine dispatch gateway for autonomous agents.
 * Validates machine Bearer token, enforces rate-limiting, and guarantees least-privilege execution.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedAction = body.action || "read_telemetry";

    // Map machine action to required granular permission
    let requiredPermission = "reports.read";
    let resourceTarget = "Runtime:Telemetry";

    if (requestedAction === "generate_compliance_summary") {
      requiredPermission = "reports.create";
      resourceTarget = "Compliance:Reports";
    } else if (requestedAction === "query_user_directory") {
      requiredPermission = "users.read";
      resourceTarget = "Users:Directory";
    } else if (requestedAction === "modify_system_roles") {
      requiredPermission = "roles.manage";
      resourceTarget = "Security:Roles";
    } else if (requestedAction === "read_agent_telemetry") {
      requiredPermission = "agents.read";
      resourceTarget = "Agents:Telemetry";
    }

    // 1. Enforce Machine-to-Machine Authentication & RBAC
    const auth = await authenticateMachineRequest(request, {
      requiredPermission,
      action: `AGENT_EXEC_${requestedAction.toUpperCase()}`,
      resource: resourceTarget,
    });

    if (!auth.authorized) {
      return auth.response!;
    }

    const { agent } = auth;

    // 2. Execute simulated agent tool task safely within delegated scope
    let resultPayload: Record<string, unknown> = {};

    switch (requestedAction) {
      case "generate_compliance_summary":
        resultPayload = {
          task: "generate_compliance_summary",
          status: "COMPLETED",
          summary: "Zero-Trust posture verified. All non-human machine tokens are encrypted with bcrypt ($2a$10$). No standing superuser privileges detected.",
          timestamp: new Date().toISOString(),
          complianceScore: "98.4%",
        };
        break;

      case "read_agent_telemetry":
        const agentCount = await prisma.agent.count();
        resultPayload = {
          task: "read_agent_telemetry",
          registeredAgentsCount: agentCount,
          runtimeStatus: "OPTIMAL",
          enforcedRateLimit: `${agent!.rateLimit} req/min`,
          activePolicy: "Least-Privilege Non-Human Identity",
        };
        break;

      default:
        resultPayload = {
          task: requestedAction,
          status: "SUCCESS",
          message: `Autonomous task '${requestedAction}' completed within delegated permission boundaries.`,
        };
    }

    return NextResponse.json({
      success: true,
      agentId: agent!.id,
      agentName: agent!.name,
      assignedRole: agent!.roleName,
      executedAction: requestedAction,
      delegatedPermissionUsed: requiredPermission,
      rateLimitLimit: agent!.rateLimit,
      output: resultPayload,
    });
  } catch (error: unknown) {
    console.error("Agent execution error:", error);
    return NextResponse.json(
      { error: "Machine execution gateway error." },
      { status: 500 }
    );
  }
}

