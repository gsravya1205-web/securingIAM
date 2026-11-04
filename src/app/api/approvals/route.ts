import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

interface ApprovalItem {
  id: string;
  requesterName: string;
  requesterType: "HUMAN" | "AGENT";
  agentName?: string;
  requestedAction: string;
  resource: string;
  reason: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
}

// Active state store for dual-control requests
const approvalsStore: ApprovalItem[] = [
  {
    id: "apr-101",
    requesterName: "Report Assistant",
    requesterType: "AGENT",
    agentName: "Report Assistant",
    requestedAction: "EXPORT_AUDIT_LOGS",
    resource: "Compliance:QuarterlyAudit",
    reason: "Automated generation of ISO 27001 exportable evidence archive.",
    date: "Today, 14:15",
    status: "PENDING",
  },
  {
    id: "apr-102",
    requesterName: "Security Monitoring Agent",
    requesterType: "AGENT",
    agentName: "Security Monitoring Agent",
    requestedAction: "EMERGENCY_KEY_ROTATION",
    resource: "Agents:GatewayTokens",
    reason: "Detected unusual latency spikes; requesting proactive credential rotation.",
    date: "Today, 13:40",
    status: "PENDING",
  },
  {
    id: "apr-103",
    requesterName: "Morgan Chen",
    requesterType: "HUMAN",
    requestedAction: "ELEVATE_TO_ADMIN_1HR",
    resource: "Roles:AdminMatrix",
    reason: "Temporary break-glass privilege grant for incident remediation triage.",
    date: "Today, 11:20",
    status: "PENDING",
  },
  {
    id: "apr-104",
    requesterName: "User Support Agent",
    requesterType: "AGENT",
    agentName: "User Support Agent",
    requestedAction: "READ_USER_EMAILS",
    resource: "Users:Directory",
    reason: "Batch lookup of onboarding tickets for internal employees.",
    date: "Yesterday",
    status: "APPROVED",
  },
];

// GET /api/approvals -> Retrieve approval requests
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to inspect approval queue." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    approvals: approvalsStore,
    viewerRole: session.roleName,
  });
}

// POST /api/approvals -> Submit a new action requiring human dual-control approval
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requesterName, requesterType = "AGENT", requestedAction, resource, reason } = body;

    if (!requesterName || !requestedAction || !resource) {
      return NextResponse.json(
        { error: "requesterName, requestedAction, and resource are required." },
        { status: 400 }
      );
    }

    const newApproval: ApprovalItem = {
      id: `apr-${Date.now().toString(36)}`,
      requesterName,
      requesterType,
      agentName: requesterType === "AGENT" ? requesterName : undefined,
      requestedAction,
      resource,
      reason: reason || "Autonomous sensitive operation escalation.",
      date: "Just now",
      status: "PENDING",
    };

    approvalsStore.unshift(newApproval);

    // Record audit trail event
    await prisma.auditLog.create({
      data: {
        actorType: requesterType === "AGENT" ? "AGENT" : "USER",
        actorId: requesterName,
        actorName: requesterName,
        action: "APPROVAL_REQUEST_SUBMITTED",
        resource,
        status: "SUCCESS",
        details: `Submitted dual-control elevation request for action [${requestedAction}]: ${reason}`,
      },
    });

    return NextResponse.json({ success: true, approval: newApproval }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create approval error:", error);
    return NextResponse.json({ error: "Failed to create approval request." }, { status: 500 });
  }
}

// PATCH /api/approvals -> Render human supervisor verdict (Approve or Reject)
export async function PATCH(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to render approval decisions." },
      { status: 401 }
    );
  }

  // Dual-control policy: Only Admin and Manager are authorized to render human decisions
  if (session.roleName !== "Admin" && session.roleName !== "Manager") {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "APPROVAL_DECISION_ATTEMPT",
        resource: "Security:ApprovalQueue",
        status: "DENIED",
        details: `Access Denied: Role [${session.roleName}] is unauthorized to approve or reject dual-control requests.`,
        userId: session.id,
      },
    });

    return NextResponse.json(
      { error: "Access Denied: Only Admin or Manager supervisors can render dual-control verdicts." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { id, decision } = body;

    if (!id || (decision !== "APPROVED" && decision !== "REJECTED")) {
      return NextResponse.json(
        { error: "Valid 'id' and 'decision' ('APPROVED' | 'REJECTED') are required." },
        { status: 400 }
      );
    }

    const itemIndex = approvalsStore.findIndex((a) => a.id === id);
    if (itemIndex === -1) {
      return NextResponse.json({ error: `Approval item [${id}] not found.` }, { status: 404 });
    }

    approvalsStore[itemIndex].status = decision;
    const targetItem = approvalsStore[itemIndex];

    // Log the immutable supervisory decision in SQLite AuditLog
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: `APPROVAL_VERDICT_${decision}`,
        resource: targetItem.resource,
        status: "SUCCESS",
        details: `Supervisor [${session.name}] (${session.roleName}) marked request [${targetItem.requestedAction}] for [${targetItem.requesterName}] as ${decision}.`,
        userId: session.id,
      },
    });

    return NextResponse.json({
      success: true,
      approval: targetItem,
      supervisor: { name: session.name, role: session.roleName },
    });
  } catch (error: unknown) {
    console.error("Patch approval error:", error);
    return NextResponse.json({ error: "Failed to record approval decision." }, { status: 500 });
  }
}

