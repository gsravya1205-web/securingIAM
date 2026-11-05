import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// In-memory policy configuration registry with secure defaults
export interface SecurityPolicyConfig {
  maxJitDurationMinutes: number;
  maxDelegationDurationMinutes: number;
  defaultAgentRateLimit: number;
  bruteForceThreshold: number;
  requireDualControlForFinancials: boolean;
  updatedAt: string;
  updatedBy: string;
}

let activePolicyConfig: SecurityPolicyConfig = {
  maxJitDurationMinutes: 240, // 4 hours max per Zero Standing Privilege
  maxDelegationDurationMinutes: 1440, // 24 hours max
  defaultAgentRateLimit: 120, // 120 requests/min
  bruteForceThreshold: 3,
  requireDualControlForFinancials: true,
  updatedAt: new Date().toISOString(),
  updatedBy: "System Administrator",
};

/**
 * GET /api/settings/security-policies
 * Returns active runtime security policies.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to read security policies." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    policies: activePolicyConfig,
  });
}

/**
 * POST /api/settings/security-policies
 * Updates runtime security policies (Admin only).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to modify security policies." },
      { status: 401 }
    );
  }

  if (session.roleName !== "Admin") {
    return NextResponse.json(
      { error: "Unauthorized: Only administrators may modify enterprise security policies." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      maxJitDurationMinutes,
      maxDelegationDurationMinutes,
      defaultAgentRateLimit,
      bruteForceThreshold,
      requireDualControlForFinancials,
    } = body;

    if (maxJitDurationMinutes && (maxJitDurationMinutes < 15 || maxJitDurationMinutes > 480)) {
      return NextResponse.json(
        { error: "maxJitDurationMinutes must be between 15 and 480 minutes." },
        { status: 400 }
      );
    }

    activePolicyConfig = {
      maxJitDurationMinutes: Number(maxJitDurationMinutes) || activePolicyConfig.maxJitDurationMinutes,
      maxDelegationDurationMinutes: Number(maxDelegationDurationMinutes) || activePolicyConfig.maxDelegationDurationMinutes,
      defaultAgentRateLimit: Number(defaultAgentRateLimit) || activePolicyConfig.defaultAgentRateLimit,
      bruteForceThreshold: Number(bruteForceThreshold) || activePolicyConfig.bruteForceThreshold,
      requireDualControlForFinancials: typeof requireDualControlForFinancials === "boolean" ? requireDualControlForFinancials : activePolicyConfig.requireDualControlForFinancials,
      updatedAt: new Date().toISOString(),
      updatedBy: session.name,
    };

    // Log policy change to audit log
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "SECURITY_POLICY_UPDATED",
        resource: "System:SecurityPolicies",
        status: "SUCCESS",
        details: `Administrator [${session.name}] updated enterprise security policies. Max JIT: ${activePolicyConfig.maxJitDurationMinutes}m, Max Delegation: ${activePolicyConfig.maxDelegationDurationMinutes}m.`,
        userId: session.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Security policies updated successfully.",
      policies: activePolicyConfig,
    });
  } catch (error) {
    console.error("Security policy update error:", error);
    return NextResponse.json(
      { error: "Internal server error updating security policies." },
      { status: 500 }
    );
  }
}

