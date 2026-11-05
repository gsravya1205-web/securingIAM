import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { runDemonstrationScenario, ensureDemoAgent } from "@/lib/demo-scenarios";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/demonstration/run-scenario
 * Returns info about the demonstration agent and the 10 available scenarios.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to inspect demonstration console." },
      { status: 401 }
    );
  }

  const { agent } = await ensureDemoAgent();

  const scenarios = [
    {
      id: 1,
      title: "Scenario 1: Authorized Access",
      description: "Agent requests General Analytics report using standing role permission.",
      expected: "ALLOW",
      resource: "Reports:General",
      action: "reports.read",
    },
    {
      id: 2,
      title: "Scenario 2: Unauthorized Access Attempt",
      description: "Agent attempts to access restricted HR Records without permission.",
      expected: "DENY",
      resource: "Records:HR",
      action: "users.read",
    },
    {
      id: 3,
      title: "Scenario 3: Delegated Access",
      description: "Admin grants scoped delegation for Sales Reports. Agent calls endpoint.",
      expected: "ALLOW",
      resource: "Reports:Sales",
      action: "reports.read (Delegated)",
    },
    {
      id: 4,
      title: "Scenario 4: Out-of-Scope Access Breach",
      description: "Agent attempts to use sales delegation to breach HR Records.",
      expected: "DENY",
      resource: "Records:HR",
      action: "reports.read vs HR scope",
    },
    {
      id: 5,
      title: "Scenario 5: Revoked Access",
      description: "Admin revokes delegation. Immediate subsequent agent request blocked.",
      expected: "DENY",
      resource: "Reports:Sales",
      action: "reports.read",
    },
    {
      id: 6,
      title: "Scenario 6: Human JIT Privilege Elevation",
      description: "Employee temporary privilege activated without mutating permanent role.",
      expected: "ALLOW",
      resource: "Users:Directory",
      action: "users.create (JIT 60m)",
    },
    {
      id: 7,
      title: "Scenario 7: Temporal Expiration (TTL Elapsed)",
      description: "Delegation validity time window expires. Subsequent call rejected.",
      expected: "DENY",
      resource: "Reports:Sales",
      action: "reports.read",
    },
    {
      id: 8,
      title: "Scenario 8: Dual-Control Approval Requirement",
      description: "Agent requests sensitive financial data. Operation paused until approved.",
      expected: "APPROVAL_REQUIRED",
      resource: "Reports:SensitiveFinancial",
      action: "reports.create",
    },
    {
      id: 9,
      title: "Scenario 9: Suspended Agent Isolation",
      description: "Agent identity suspended by SOC. All protected calls fail with 403.",
      expected: "DENY",
      resource: "Reports:General",
      action: "reports.read",
    },
    {
      id: 10,
      title: "Scenario 10: Emergency Kill-Switch Fleet Freeze",
      description: "Global kill-switch activated. All agent M2M execution frozen.",
      expected: "DENY",
      resource: "Reports:General",
      action: "All Machine Calls",
    },
  ];

  return NextResponse.json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      description: agent.description,
      rateLimit: agent.rateLimit,
    },
    scenarios,
  });
}

/**
 * POST /api/demonstration/run-scenario
 * Executes a chosen demonstration scenario against the real backend API.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to run demonstration scenarios." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const scenarioId = Number(body.scenarioId);

    if (isNaN(scenarioId) || scenarioId < 1 || scenarioId > 10) {
      return NextResponse.json(
        { error: "scenarioId must be an integer between 1 and 10." },
        { status: 400 }
      );
    }

    const result = await runDemonstrationScenario(scenarioId);

    // Record forensic audit log
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "DEMO_SCENARIO_EXECUTED",
        resource: result.endpoint,
        status: result.actualVerdict === result.expectedVerdict ? "SUCCESS" : "DENIED",
        details: `Demonstration ${result.title} executed. Verdict: [${result.actualVerdict}], HTTP Status: ${result.actualStatus}`,
        userId: session.id,
      },
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Demonstration execution error:", error);
    return NextResponse.json(
      { error: "Internal server error executing demonstration scenario." },
      { status: 500 }
    );
  }
}

