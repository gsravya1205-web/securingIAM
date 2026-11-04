import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { invalidateTokenCache } from "@/lib/m2m";

// POST /api/agents/rotate-key -> Rotate API key for an agent (Requires agents.manage)
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "agents.manage",
    action: "AGENT_KEY_ROTATION",
    resource: "Agents:Credentials",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json();
    const { agentId } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required for key rotation." },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return NextResponse.json(
        { error: `Agent with ID [${agentId}] not found.` },
        { status: 404 }
      );
    }

    if (agent.status === "REVOKED") {
      return NextResponse.json(
        { error: "Cannot rotate credentials for a REVOKED agent. Reactivate or reprovision identity." },
        { status: 400 }
      );
    }

    // Generate new CSPRNG machine token
    const newRawKey = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
    const newApiKeyHash = await bcrypt.hash(newRawKey, 10);

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        apiKeyHash: newApiKeyHash,
      },
    });

    invalidateTokenCache(agentId);

    // Write audit event
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: auth.session!.id,
        actorName: auth.session!.name,
        action: "AGENT_KEY_ROTATED",
        resource: `Agent:${agent.name}`,
        status: "SUCCESS",
        details: `Rotated high-entropy machine credential for agent [${agent.name}]. New bcrypt hash committed to SQLite.`,
        userId: auth.session!.id,
        agentId: agent.id,
      },
    });

    return NextResponse.json({
      success: true,
      agentId: agent.id,
      agentName: agent.name,
      newSecretKey: newRawKey,
    });
  } catch (error: unknown) {
    console.error("Rotate key error:", error);
    return NextResponse.json(
      { error: "Internal server error rotating agent credentials." },
      { status: 500 }
    );
  }
}

