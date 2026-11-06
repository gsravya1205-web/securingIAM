import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { authenticateMachineRequest } from "@/lib/m2m";

export interface CreateApprovalInput {
  targetAction?: string;
  requestedAction?: string;
  resource?: string;
  justification?: string;
  reason?: string;
  expiresInHours?: number;
  expiresAt?: string;
}

/**
 * Ensures initial baseline approval requests exist in SQLite if table is completely empty.
 * Matches existing database users and agents.
 */
export async function seedInitialApprovalsIfEmpty(): Promise<void> {
  const count = await prisma.approvalRequest.count();
  if (count > 0) return;

  const admin = await prisma.user.findFirst({ where: { role: { name: "Admin" } } });
  const manager = await prisma.user.findFirst({ where: { role: { name: "Manager" } } });
  const employee = await prisma.user.findFirst({ where: { role: { name: "Employee" } } });
  const reportAgent =
    (await prisma.agent.findFirst({ where: { name: "Report Assistant" } })) ||
    (await prisma.agent.findFirst());
  const monitorAgent = await prisma.agent.findFirst({
    where: { name: "Security Monitoring Agent" },
  });

  const now = Date.now();
  const in24Hours = new Date(now + 24 * 3600 * 1000);
  const yesterday = new Date(now - 24 * 3600 * 1000);
  const twoDaysAgo = new Date(now - 48 * 3600 * 1000);

  const initialRequests = [];

  if (reportAgent) {
    initialRequests.push({
      requesterType: "AGENT",
      requesterId: reportAgent.id,
      requesterName: reportAgent.name,
      targetAction: "reports.create",
      resource: "Compliance:QuarterlyAudit",
      justification: "Automated generation of ISO 27001 exportable evidence archive.",
      status: "PENDING",
      expiresAt: in24Hours,
    });
  }

  if (monitorAgent) {
    initialRequests.push({
      requesterType: "AGENT",
      requesterId: monitorAgent.id,
      requesterName: monitorAgent.name,
      targetAction: "agents.manage",
      resource: "Agents:GatewayTokens",
      justification: "Detected unusual latency spikes; requesting proactive credential rotation.",
      status: "PENDING",
      expiresAt: in24Hours,
    });
  }

  if (manager) {
    initialRequests.push({
      requesterType: "USER",
      requesterId: manager.id,
      requesterName: manager.name,
      targetAction: "roles.manage",
      resource: "Roles:AdminMatrix",
      justification: "Temporary break-glass privilege grant for incident remediation triage.",
      status: "PENDING",
      expiresAt: in24Hours,
    });
  }

  if (employee && admin) {
    initialRequests.push({
      requesterType: "USER",
      requesterId: employee.id,
      requesterName: employee.name,
      targetAction: "reports.create",
      resource: "Reports:WeeklyAnalytics",
      justification: "Scheduled batch compilation of departmental efficiency telemetry.",
      status: "APPROVED",
      reviewerId: admin.id,
      reviewerNote: "Approved per standard departmental analytics protocol.",
      reviewedAt: yesterday,
      expiresAt: in24Hours,
    });
  }

  if (employee && manager) {
    initialRequests.push({
      requesterType: "USER",
      requesterId: employee.id,
      requesterName: employee.name,
      targetAction: "users.delete",
      resource: "Users:AccountDeactivation",
      justification: "Direct deletion of employee account without prior HR signoff ticket.",
      status: "REJECTED",
      reviewerId: manager.id,
      reviewerNote: "Rejected: All employee deactivations require written HR ticket approval.",
      reviewedAt: yesterday,
      expiresAt: in24Hours,
    });
  }

  if (reportAgent) {
    initialRequests.push({
      requesterType: "AGENT",
      requesterId: reportAgent.id,
      requesterName: reportAgent.name,
      targetAction: "reports.create",
      resource: "Security:AnomalyReport",
      justification: "Routine overnight scanning ticket that was not approved within operational TTL.",
      status: "EXPIRED",
      expiresAt: yesterday,
      createdAt: twoDaysAgo,
    });
  }

  for (const item of initialRequests) {
    await prisma.approvalRequest.create({ data: item });
  }
}

/**
 * Automatically marks pending approval requests whose expiresAt timestamp is in the past as EXPIRED.
 */
export async function resolvePendingExpirations(): Promise<number> {
  const now = new Date();
  const result = await prisma.approvalRequest.updateMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });
  return result.count;
}

/**
 * Lists approval requests from SQLite.
 * Human supervisors (Admin, Manager) see all requests.
 * Standard users see only requests they initiated.
 */
export async function listApprovalRequests(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to view approval queue." },
      { status: 401 }
    );
  }

  // Seed baseline if empty, and auto-expire past-due requests
  await seedInitialApprovalsIfEmpty();
  await resolvePendingExpirations();

  const isSupervisor =
    session.roleName === "Admin" ||
    session.roleName === "Manager" ||
    session.permissions.includes("roles.manage");

  const whereClause = isSupervisor
    ? {}
    : {
        requesterType: "USER",
        requesterId: session.id,
      };

  const approvals = await prisma.approvalRequest.findMany({
    where: whereClause,
    include: {
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    approvals,
    currentUserId: session.id,
    currentUserRole: session.roleName,
    isSupervisor,
  });
}

/**
 * Creates a new approval request in SQLite.
 * Derives requester identity strictly from verified server-side session or machine API key.
 * Never trusts requesterType or requesterId supplied by the client.
 */
export async function createApprovalRequest(request: NextRequest) {
  try {
    const body: CreateApprovalInput = await request.json();

    const targetAction = (body.targetAction || body.requestedAction)?.trim();
    const resource = body.resource?.trim();
    const justification = (body.justification || body.reason)?.trim();

    if (!targetAction || !resource || !justification) {
      return NextResponse.json(
        { error: "targetAction, resource, and justification are required fields." },
        { status: 400 }
      );
    }

    // Determine expiration date
    let expiresAtDate: Date | null = null;
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (isNaN(parsed.getTime()) || parsed <= new Date()) {
        return NextResponse.json(
          { error: "Invalid expiration date. expiresAt must be a valid future timestamp." },
          { status: 400 }
        );
      }
      expiresAtDate = parsed;
    } else if (body.expiresInHours && body.expiresInHours > 0) {
      expiresAtDate = new Date(Date.now() + body.expiresInHours * 3600 * 1000);
    } else {
      // Default 24 hours TTL
      expiresAtDate = new Date(Date.now() + 24 * 3600 * 1000);
    }

    // Derive identity securely from server-verified credentials
    let requesterType: "USER" | "AGENT";
    let requesterId: string;
    let requesterName: string;

    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Machine agent authentication path
      const machineAuth = await authenticateMachineRequest(request, {
        action: "APPROVAL_REQUEST_SUBMIT",
        resource,
      });

      if (!machineAuth.authorized || !machineAuth.agent) {
        return machineAuth.response || NextResponse.json(
          { error: "Unauthorized: Invalid or inactive AI agent credentials." },
          { status: 401 }
        );
      }

      if (machineAuth.agent.status !== "ACTIVE") {
        return NextResponse.json(
          { error: `Machine identity [${machineAuth.agent.name}] is ${machineAuth.agent.status}. Only ACTIVE agents can submit approval requests.` },
          { status: 403 }
        );
      }

      requesterType = "AGENT";
      requesterId = machineAuth.agent.id;
      requesterName = machineAuth.agent.name;
    } else {
      // Human user session authentication path
      const session = await getSession();
      if (!session) {
        return NextResponse.json(
          { error: "Authentication required. Provide a valid user session or agent Bearer token." },
          { status: 401 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: "User identity not found in database." },
          { status: 401 }
        );
      }

      requesterType = "USER";
      requesterId = user.id;
      requesterName = user.name;
    }

    // Create the persistent ApprovalRequest in SQLite
    const newApproval = await prisma.approvalRequest.create({
      data: {
        requesterType,
        requesterId,
        requesterName,
        targetAction,
        resource,
        justification,
        status: "PENDING",
        expiresAt: expiresAtDate,
      },
    });

    // Record immutable audit log
    await prisma.auditLog.create({
      data: {
        actorType: requesterType,
        actorId: requesterId,
        actorName: requesterName,
        action: "APPROVAL_REQUEST_CREATED",
        resource,
        status: "SUCCESS",
        details: `Created dual-control approval request [${targetAction}] for [${resource}]: ${justification}`,
        ...(requesterType === "USER" ? { userId: requesterId } : { agentId: requesterId }),
      },
    });

    return NextResponse.json(
      { success: true, approval: newApproval },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Create approval error:", error);
    return NextResponse.json(
      { error: "Internal server error while creating approval request." },
      { status: 500 }
    );
  }
}

/**
 * Automatically creates or retrieves an existing unexpired PENDING approval request for an AI agent.
 * Prevents duplicate ticket creation when an active ticket for the same agent, action, and resource is already pending.
 */
export async function ensureAgentApprovalTicket(
  agent: { id: string; name: string },
  targetAction: string,
  resource: string,
  justification?: string
): Promise<{
  ticket: {
    id: string;
    requesterType: string;
    requesterId: string;
    requesterName: string;
    targetAction: string;
    resource: string;
    justification: string;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
  };
  isNew: boolean;
}> {
  const now = new Date();

  // 1. Search for an existing active PENDING ticket for this agent, action, and resource
  const existingPending = await prisma.approvalRequest.findFirst({
    where: {
      requesterType: "AGENT",
      requesterId: agent.id,
      targetAction,
      resource,
      status: "PENDING",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingPending) {
    return { ticket: existingPending, isNew: false };
  }

  // 2. Default 24 hours TTL for newly provisioned machine approval tickets
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const cleanJustification =
    justification?.trim() ||
    `Autonomous execution of [${targetAction}] on high-risk resource [${resource}] paused pending supervisory human review.`;

  // 3. Atomically create the new pending ticket in SQLite
  const ticket = await prisma.approvalRequest.create({
    data: {
      requesterType: "AGENT",
      requesterId: agent.id,
      requesterName: agent.name,
      targetAction,
      resource,
      justification: cleanJustification,
      status: "PENDING",
      expiresAt,
    },
  });

  // 4. Record audit log for ticket creation
  await prisma.auditLog.create({
    data: {
      actorType: "AGENT",
      actorId: agent.id,
      actorName: agent.name,
      action: "APPROVAL_REQUEST_CREATED",
      resource,
      status: "SUCCESS",
      details: `Automated approval ticket [${ticket.id}] created for agent [${agent.name}] requesting [${targetAction}] on [${resource}].`,
      agentId: agent.id,
    },
  });

  return { ticket, isNew: true };
}

/**
 * Processes a human supervisor decision (APPROVED | REJECTED).
 * Enforces Separation of Duties, expiration checks, and atomic conditional update.
 */
export async function processApprovalDecision(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  reviewerNote?: string
) {
  // 1. Session check: Reviewer must be an authenticated human user
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to review approval requests." },
      { status: 401 }
    );
  }

  // 2. Permission check: Only Admin, Manager, or users with roles.manage permission
  const isSupervisor =
    session.roleName === "Admin" ||
    session.roleName === "Manager" ||
    session.permissions.includes("roles.manage");

  if (!isSupervisor) {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "APPROVAL_REVIEW_UNAUTHORIZED",
        resource: `ApprovalRequest:${approvalId}`,
        status: "DENIED",
        details: `Access Denied: Role [${session.roleName}] is unauthorized to review approval requests.`,
        userId: session.id,
      },
    });

    return NextResponse.json(
      { error: "Access Denied: Only Admin or Manager supervisors can review approval requests." },
      { status: 403 }
    );
  }

  // 3. Find target approval
  const target = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
    include: { reviewer: { select: { id: true, name: true, email: true } } },
  });

  if (!target) {
    return NextResponse.json(
      { error: `Approval request [${approvalId}] not found.` },
      { status: 404 }
    );
  }

  // 4. Separation of Duties: Requester cannot approve or reject their own request
  if (target.requesterType === "USER" && target.requesterId === session.id) {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "APPROVAL_SELF_REVIEW_REJECTED",
        resource: `ApprovalRequest:${approvalId}`,
        status: "DENIED",
        details: `Separation of Duties violation: Requester [${session.name}] attempted to review their own request.`,
        userId: session.id,
      },
    });

    return NextResponse.json(
      { error: "Separation of Duties violation: You cannot approve or reject your own request." },
      { status: 403 }
    );
  }

  // 5. Expiration check
  if (target.expiresAt && new Date(target.expiresAt) < new Date()) {
    if (target.status === "PENDING") {
      await prisma.approvalRequest.update({
        where: { id: approvalId },
        data: { status: "EXPIRED" },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "APPROVAL_REVIEW_EXPIRED",
        resource: `ApprovalRequest:${approvalId}`,
        status: "DENIED",
        details: `Cannot review approval request [${approvalId}]: Request has expired.`,
        userId: session.id,
      },
    });

    return NextResponse.json(
      { error: "Cannot review request: This approval request has expired." },
      { status: 400 }
    );
  }

  // 6. Must be in PENDING status
  if (target.status !== "PENDING") {
    return NextResponse.json(
      { error: `Request has already been resolved with status: ${target.status}.` },
      { status: 409 }
    );
  }

  // 7. Atomic transaction preventing race conditions (e.g. concurrent double reviews)
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.approvalRequest.updateMany({
        where: {
          id: approvalId,
          status: "PENDING",
        },
        data: {
          status: decision,
          reviewerId: session.id,
          reviewerNote: reviewerNote?.trim() || null,
          reviewedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new Error("CONCURRENT_UPDATE_CONFLICT");
      }

      return await tx.approvalRequest.findUnique({
        where: { id: approvalId },
        include: {
          reviewer: {
            select: { id: true, name: true, email: true, role: { select: { name: true } } },
          },
        },
      });
    });

    // 8. Log supervisory decision in audit trail
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: `APPROVAL_DECISION_${decision}`,
        resource: target.resource,
        status: "SUCCESS",
        details: `Supervisor [${session.name}] (${session.roleName}) marked request [${target.targetAction}] for [${target.requesterName}] as ${decision}.${reviewerNote ? ` Note: ${reviewerNote}` : ""}`,
        userId: session.id,
      },
    });

    return NextResponse.json({
      success: true,
      approval: updated,
      supervisor: { name: session.name, role: session.roleName },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "CONCURRENT_UPDATE_CONFLICT") {
      return NextResponse.json(
        { error: "Concurrency conflict: This approval request was already resolved by another reviewer." },
        { status: 409 }
      );
    }
    console.error("Atomic approval error:", err);
    return NextResponse.json(
      { error: "Internal server error while recording approval decision." },
      { status: 500 }
    );
  }
}
