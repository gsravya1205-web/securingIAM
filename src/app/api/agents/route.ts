import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

// GET /api/agents -> Requires agents.read (Admin and Manager allowed; Employee denied)
export async function GET() {
  const auth = await authorizeRequest({
    requiredPermission: "agents.read",
    action: "AGENT_LIST_READ",
    resource: "Agents:Registry",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const agents = await prisma.agent.findMany({
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, agents });
  } catch (error: unknown) {
    console.error("Fetch agents error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve agent identities from database." },
      { status: 500 }
    );
  }
}

// POST /api/agents -> Requires agents.manage (Admin allowed; Manager and Employee denied)
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "agents.manage",
    action: "AGENT_REGISTER",
    resource: "Agents:Registry",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json();
    const { name, description, rateLimit = 100, roleName = "AI Agent" } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Agent name is required." },
        { status: 400 }
      );
    }

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "Agent description / operational scope is required." },
        { status: 400 }
      );
    }

    // Locate the assigned role in database
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: `Specified role [${roleName}] does not exist.` },
        { status: 400 }
      );
    }

    // Generate cryptographically secure API credentials for autonomous machine identity
    const rawKeySecret = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
    const apiKeyHash = await bcrypt.hash(rawKeySecret, 10);

    const newAgent = await prisma.agent.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        apiKeyHash,
        status: "ACTIVE",
        rateLimit: Number(rateLimit) || 100,
        roleId: role.id,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    // Record dedicated audit log for agent registration
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: auth.session!.id,
        actorName: auth.session!.name,
        action: "AGENT_PROVISIONED",
        resource: `Agent:${newAgent.name}`,
        status: "SUCCESS",
        details: `Provisioned autonomous agent [${newAgent.name}] with rateLimit=${newAgent.rateLimit} req/min. Key hash registered.`,
        userId: auth.session!.id,
        agentId: newAgent.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        agent: newAgent,
        // The raw API key is returned ONCE to the administrator and never stored in plain text
        rawApiKey: rawKeySecret,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Create agent error:", error);
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    if (errMessage.includes("Unique constraint failed")) {
      return NextResponse.json(
        { error: "An AI Agent with this name already exists in the registry." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error registering agent identity." },
      { status: 500 }
    );
  }
}

// PATCH /api/agents -> Update Agent status or parameters (Requires agents.manage)
export async function PATCH(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "agents.manage",
    action: "AGENT_STATUS_UPDATE",
    resource: "Agents:Registry",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json();
    const { id, status, rateLimit, description } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Agent ID is required for updates." },
        { status: 400 }
      );
    }

    const existing = await prisma.agent.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Agent with ID [${id}] not found.` },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      const validStatuses = ["ACTIVE", "SUSPENDED", "REVOKED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed values: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (rateLimit !== undefined) {
      const parsedRate = Number(rateLimit);
      if (isNaN(parsedRate) || parsedRate <= 0) {
        return NextResponse.json(
          { error: "rateLimit must be a positive integer." },
          { status: 400 }
        );
      }
      updateData.rateLimit = parsedRate;
    }

    if (description && typeof description === "string") {
      updateData.description = description.trim();
    }

    const updatedAgent = await prisma.agent.update({
      where: { id },
      data: updateData,
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    // Write audit event
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: auth.session!.id,
        actorName: auth.session!.name,
        action: status === "REVOKED" ? "AGENT_DECOMMISSIONED" : "AGENT_STATUS_MODIFIED",
        resource: `Agent:${updatedAgent.name}`,
        status: "SUCCESS",
        details: `Updated parameters for [${updatedAgent.name}]: ${JSON.stringify(updateData)}`,
        userId: auth.session!.id,
        agentId: updatedAgent.id,
      },
    });

    return NextResponse.json({ success: true, agent: updatedAgent });
  } catch (error: unknown) {
    console.error("Update agent error:", error);
    return NextResponse.json(
      { error: "Failed to update agent identity parameters." },
      { status: 500 }
    );
  }
}

