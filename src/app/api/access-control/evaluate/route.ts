import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  evaluateAccessPolicy,
  ENTERPRISE_RESOURCES,
} from "@/lib/policy-engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/access-control/evaluate
 * Returns real identities, available resources, and actions from database for policy evaluator scenarios.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to query policy evaluation registry." },
      { status: 401 }
    );
  }

  // 1. Fetch real human users from database
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: {
        select: {
          id: true,
          name: true,
          permissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // 2. Fetch real AI agents from database
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      role: {
        select: {
          id: true,
          name: true,
          permissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // 3. Fetch permissions from database
  const permissions = await prisma.permission.findMany({
    select: {
      code: true,
      description: true,
      category: true,
    },
    orderBy: { code: "asc" },
  });

  const formattedUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    type: "USER" as const,
    role: u.role.name,
    status: "ACTIVE",
    perms: u.role.permissions.map((p) => p.permission.code),
  }));

  const formattedAgents = agents.map((a) => ({
    id: a.id,
    name: a.name,
    type: "AGENT" as const,
    role: a.role.name,
    status: a.status,
    perms: a.role.permissions.map((p) => p.permission.code),
  }));

  return NextResponse.json({
    success: true,
    identities: [...formattedUsers, ...formattedAgents],
    resources: ENTERPRISE_RESOURCES,
    actions: permissions.map((p) => ({
      code: p.code,
      label: p.description || p.code,
      category: p.category,
    })),
  });
}

/**
 * POST /api/access-control/evaluate
 * Centralized policy evaluation endpoint. Evaluates live database policies for a subject, action, and resource.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to evaluate access policies." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { subjectId, subjectType, action, resource } = body;

    if (!subjectId || !subjectType || !action || !resource) {
      return NextResponse.json(
        { error: "subjectId, subjectType ('USER' or 'AGENT'), action, and resource are required." },
        { status: 400 }
      );
    }

    if (subjectType !== "USER" && subjectType !== "AGENT") {
      return NextResponse.json(
        { error: "subjectType must be either 'USER' or 'AGENT'." },
        { status: 400 }
      );
    }

    // Run Centralized Policy Decision Engine
    const evaluation = await evaluateAccessPolicy({
      subjectId: String(subjectId).trim(),
      subjectType,
      action: String(action).trim(),
      resource: String(resource).trim(),
    });

    // Record forensic audit log of the policy decision
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "POLICY_EVALUATION_EXECUTED",
        resource: evaluation.resource,
        status: evaluation.decision === "ALLOW" ? "SUCCESS" : "DENIED",
        details: `Policy verdict: [${evaluation.decision}] for ${evaluation.subjectType} [${evaluation.subjectName}] on [${evaluation.action}] via ${evaluation.policyRule}. Reason: ${evaluation.reason}`,
        userId: session.id,
      },
    });

    return NextResponse.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    console.error("Policy evaluation error:", error);
    return NextResponse.json(
      { error: "Internal server error while evaluating access policy." },
      { status: 500 }
    );
  }
}

