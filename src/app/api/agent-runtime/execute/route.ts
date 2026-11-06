import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { authenticateMachineRequest } from "@/lib/m2m";
import { getAgentActionDefinition, AGENT_ACTION_REGISTRY } from "@/lib/agent-runtime";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Autonomous AI Agent Runtime Execution Engine.
 * 
 * Enforces the complete Zero-Trust execution sequence:
 * 1. Payload validation & size hardening
 * 2. Backend Action Registry resolution
 * 3. Machine-to-Machine credential authentication
 * 4. Centralized PDP authorization (RBAC & scoped delegations)
 * 5. Supervisory approval verification & atomic single-use ticket consumption
 * 6. Delegated handler execution
 * 7. Comprehensive forensic audit logging
 * 8. Standardized execution response envelope
 */
export async function POST(request: NextRequest) {
  const executionId = `exec_${crypto.randomBytes(12).toString("hex")}`;

  try {
    // -----------------------------------------------------------------
    // 1. Request Size & Malformed Payload Hardening (Step 3.6)
    // -----------------------------------------------------------------
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 102400) {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          executionId,
          error: "Payload Too Large: Request exceeds 100KB limit.",
          message: "Payload Too Large: Request exceeds 100KB limit.",
        },
        { status: 413 }
      );
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          executionId,
          error: "Malformed JSON payload in execution request.",
          message: "Malformed JSON payload in execution request.",
        },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          executionId,
          error: "Invalid request body. Expected a JSON object.",
          message: "Invalid request body. Expected a JSON object.",
        },
        { status: 400 }
      );
    }

    const requestedAction = body.action;

    // -----------------------------------------------------------------
    // 2. Action Registry Resolution (Step 3.3)
    // -----------------------------------------------------------------
    if (!requestedAction || typeof requestedAction !== "string" || requestedAction.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          executionId,
          error: "Missing required 'action' field in execution payload.",
          message: "Missing required 'action' field in execution payload.",
          registeredActions: Object.keys(AGENT_ACTION_REGISTRY),
        },
        { status: 400 }
      );
    }

    const actionDef = getAgentActionDefinition(requestedAction);

    // Reject unknown actions with HTTP 400 (no generic fallback allowed)
    if (!actionDef) {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          executionId,
          error: `Unknown action '${requestedAction}'. Action is not registered in the agent action registry.`,
          message: `Unknown action '${requestedAction}'. Action is not registered in the agent action registry.`,
          requestedAction,
          registeredActions: Object.keys(AGENT_ACTION_REGISTRY),
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------
    // 3. Immutable Permissions & Resource Resolution (Step 3.6)
    // -----------------------------------------------------------------
    // Canonical permission is derived strictly from backend registry; client cannot tamper with it.
    const requiredPermission = actionDef.requiredPermission;
    const resourceTarget =
      typeof body.resource === "string" && body.resource.trim().length > 0
        ? body.resource.trim()
        : actionDef.targetResource;

    // -----------------------------------------------------------------
    // 4. M2M Authentication & Centralized PDP Evaluation (Step 3.3)
    // -----------------------------------------------------------------
    const auth = await authenticateMachineRequest(request, {
      requiredPermission,
      action: requestedAction,
      resource: resourceTarget,
      approvalId: body.approvalId,
    });

    if (!auth.authorized) {
      const authDecision = auth.decision || "DENIED";
      const isApprovalReq = authDecision === "APPROVAL_REQUIRED";
      const authStatus = isApprovalReq ? "APPROVAL_REQUIRED" : "DENIED";

      // Parse JSON from auth response to preserve exact error metadata
      const authData = await auth.response!.json().catch(() => ({}));

      return NextResponse.json(
        {
          success: false,
          status: authStatus,
          action: requestedAction,
          executionId,
          data: null,
          approvalId: authData.approvalId || undefined,
          error: authData.error || "Authorization Denied",
          message: authData.error || "Authorization Denied",
          verdict: authData.verdict || authDecision,
          decision: authData.decision || authDecision,
          requiredPermission: authData.requiredPermission || requiredPermission,
          reason: authData.reason,
          delegationReason: authData.delegationReason,
          policyRule: authData.policyRule,
          registeredActions: Object.keys(AGENT_ACTION_REGISTRY),
        },
        { status: auth.response!.status }
      );
    }

    const { agent } = auth;
    const policyResult = auth.policyResult;

    // -----------------------------------------------------------------
    // 5. Approval-to-Execution Linkage & Single-Use Consumption (Step 3.4)
    // -----------------------------------------------------------------
    const resolvedApprovalId = policyResult?.approvalId || body.approvalId;
    let approvingHumanName = "None";
    let ticket: any = null;

    if (resolvedApprovalId && typeof resolvedApprovalId === "string") {
      ticket = await prisma.approvalRequest.findUnique({
        where: { id: resolvedApprovalId.trim() },
        include: {
          reviewer: { select: { id: true, name: true, email: true } },
        },
      });

      if (!ticket) {
        return NextResponse.json(
          {
            success: false,
            status: "DENIED",
            action: requestedAction,
            executionId,
            error: `Approval ticket [${resolvedApprovalId}] does not exist in approval registry.`,
            message: `Approval ticket [${resolvedApprovalId}] does not exist in approval registry.`,
          },
          { status: 403 }
        );
      }

      // Revalidate: Ticket must belong to this specific requesting agent
      if (ticket.requesterId !== agent!.id) {
        return NextResponse.json(
          {
            success: false,
            status: "DENIED",
            action: requestedAction,
            executionId,
            error: `Approval ticket [${ticket.id}] was issued to another identity. Cross-agent reuse prohibited.`,
            message: `Approval ticket [${ticket.id}] was issued to another identity. Cross-agent reuse prohibited.`,
          },
          { status: 403 }
        );
      }

      // Revalidate: Ticket action must match requested action or canonical permission
      if (ticket.targetAction !== requestedAction && ticket.targetAction !== requiredPermission) {
        return NextResponse.json(
          {
            success: false,
            status: "DENIED",
            action: requestedAction,
            executionId,
            error: `Approval ticket [${ticket.id}] is for action [${ticket.targetAction}], not [${requestedAction}]. Cross-action reuse prohibited.`,
            message: `Approval ticket [${ticket.id}] is for action [${ticket.targetAction}], not [${requestedAction}]. Cross-action reuse prohibited.`,
          },
          { status: 403 }
        );
      }

      // Revalidate: Ticket resource must match target resource
      if (
        ticket.resource !== resourceTarget &&
        !resourceTarget.startsWith(ticket.resource) &&
        !ticket.resource.startsWith(resourceTarget)
      ) {
        return NextResponse.json(
          {
            success: false,
            status: "DENIED",
            action: requestedAction,
            executionId,
            error: `Approval ticket [${ticket.id}] is scoped to resource [${ticket.resource}], not [${resourceTarget}]. Cross-resource reuse prohibited.`,
            message: `Approval ticket [${ticket.id}] is scoped to resource [${ticket.resource}], not [${resourceTarget}]. Cross-resource reuse prohibited.`,
          },
          { status: 403 }
        );
      }

      // Revalidate: Expiration boundary check
      if (ticket.expiresAt && new Date(ticket.expiresAt) < new Date()) {
        return NextResponse.json(
          {
            success: false,
            status: "DENIED",
            action: requestedAction,
            executionId,
            error: `Approval ticket [${ticket.id}] has expired. Re-approval required.`,
            message: `Approval ticket [${ticket.id}] has expired. Re-approval required.`,
          },
          { status: 403 }
        );
      }

      // Revalidate: Status must be APPROVED
      if (ticket.status !== "APPROVED") {
        const errorMsg =
          ticket.status === "EXECUTED"
            ? `Approval ticket [${ticket.id}] has already been executed. Single-use dual control prevents reuse.`
            : ticket.status === "EXECUTING"
            ? `Approval ticket [${ticket.id}] is currently executing in another process. Concurrent execution blocked.`
            : ticket.status === "FAILED"
            ? `Approval ticket [${ticket.id}] failed during prior execution attempt. Re-approval required.`
            : `Approval ticket [${ticket.id}] status is ${ticket.status}. Execution prohibited.`;

        return NextResponse.json(
          {
            success: false,
            status: ticket.status === "PENDING" ? "APPROVAL_REQUIRED" : "DENIED",
            action: requestedAction,
            executionId,
            error: errorMsg,
            message: errorMsg,
          },
          { status: 403 }
        );
      }

      // Concurrency & Single-Use Lock: Atomically transition status from APPROVED -> EXECUTING
      // Guarantees that only ONE thread can enter execution; prevents duplicate or replay runs
      const lockResult = await prisma.approvalRequest.updateMany({
        where: {
          id: ticket.id,
          status: "APPROVED",
        },
        data: {
          status: "EXECUTING",
          reviewerNote: ticket.reviewerNote
            ? `${ticket.reviewerNote} | Executing in [${executionId}]`
            : `Executing in [${executionId}]`,
        },
      });

      if (lockResult.count === 0) {
        await prisma.auditLog.create({
          data: {
            actorType: "AGENT",
            actorId: agent!.id,
            actorName: agent!.name,
            action: "APPROVAL_REUSE_REJECTED",
            resource: resourceTarget,
            status: "DENIED",
            details: `Concurrent or duplicate execution attempt blocked for approval ticket [${ticket.id}]. ExecutionId: [${executionId}].`,
            agentId: agent!.id,
          },
        });

        return NextResponse.json(
          {
            success: false,
            status: "DENIED",
            action: requestedAction,
            executionId,
            error: `Approval ticket [${ticket.id}] is already executing or was consumed by another process. Concurrent execution blocked.`,
            message: `Approval ticket [${ticket.id}] is already executing or was consumed by another process. Concurrent execution blocked.`,
          },
          { status: 403 }
        );
      }

      approvingHumanName = ticket.reviewer?.name || ticket.reviewerId || "Supervisor";
    }

    // -----------------------------------------------------------------
    // 6. Audit Logging: Execution Started (Step 3.5)
    // -----------------------------------------------------------------
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent!.id,
        actorName: agent!.name,
        action: "AGENT_EXECUTION_STARTED",
        resource: resourceTarget,
        status: "SUCCESS",
        details: `Execution started: Action [${requestedAction}] on [${resourceTarget}]. ExecutionId: [${executionId}]. ${resolvedApprovalId ? `ApprovedTicket: [${resolvedApprovalId}], ApprovedBy: [${approvingHumanName}].` : 'Standard Authorization.'}`,
        agentId: agent!.id,
        userId: policyResult?.delegationDetails?.grantorId || null,
      },
    });

    // -----------------------------------------------------------------
    // 7. Dispatch to Registered Handler (Step 3.2 / 3.3)
    // -----------------------------------------------------------------
    const executionParams: Record<string, unknown> = {
      ...(body.params && typeof body.params === "object" ? body.params : {}),
    };
    if (body.limit !== undefined) executionParams.limit = body.limit;
    if (body.offset !== undefined) executionParams.offset = body.offset;
    if (body.search !== undefined) executionParams.search = body.search;
    if (body.role !== undefined) executionParams.role = body.role;

    let output: Record<string, unknown>;
    try {
      output = await actionDef.handler({
        agent: {
          id: agent!.id,
          name: agent!.name,
          roleName: agent!.roleName,
          permissions: agent!.permissions,
          rateLimit: agent!.rateLimit,
          status: agent!.status,
          delegatedAuthUsed: agent!.delegatedAuthUsed || null,
        },
        action: requestedAction,
        resource: resourceTarget,
        params: executionParams,
      });
    } catch (handlerErr: any) {
      if (resolvedApprovalId) {
        await prisma.approvalRequest.updateMany({
          where: { id: resolvedApprovalId, status: "EXECUTING" },
          data: {
            status: "FAILED",
            reviewerNote: ticket?.reviewerNote
              ? `${ticket.reviewerNote} | FAILED in [${executionId}]: ${handlerErr?.message || 'Internal failure'}`
              : `FAILED in [${executionId}]: ${handlerErr?.message || 'Internal failure'}`,
          },
        }).catch(() => {});
      }

      await prisma.auditLog.create({
        data: {
          actorType: "AGENT",
          actorId: agent!.id,
          actorName: agent!.name,
          action: "AGENT_EXECUTION_FAILED",
          resource: resourceTarget,
          status: "DENIED",
          details: `Handler execution failed for action [${requestedAction}] on [${resourceTarget}]. ExecutionId: [${executionId}]. ${resolvedApprovalId ? `LinkedApprovalTicket: [${resolvedApprovalId}]. ` : ''}Error: ${handlerErr?.message || 'Internal failure'}.`,
          agentId: agent!.id,
        },
      });

      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          action: requestedAction,
          executionId,
          data: null,
          error: "Execution handler encountered an unexpected internal error.",
          message: "Execution handler encountered an unexpected internal error.",
        },
        { status: 500 }
      );
    }

    // -----------------------------------------------------------------
    // 8. Handle Blocked Actions & Audit Completion (Step 3.5)
    // -----------------------------------------------------------------
    if (output.status === "BLOCKED") {
      if (resolvedApprovalId) {
        await prisma.approvalRequest.updateMany({
          where: { id: resolvedApprovalId, status: "EXECUTING" },
          data: {
            status: "EXECUTED",
            reviewerNote: ticket?.reviewerNote
              ? `${ticket.reviewerNote} | Executed (Blocked by Policy) in [${executionId}]: ${(output.message as string) || 'Disabled operation'}`
              : `Executed (Blocked by Policy) in [${executionId}]: ${(output.message as string) || 'Disabled operation'}`,
          },
        }).catch(() => {});
      }

      await prisma.auditLog.create({
        data: {
          actorType: "AGENT",
          actorId: agent!.id,
          actorName: agent!.name,
          action: "AGENT_EXECUTION_BLOCKED",
          resource: resourceTarget,
          status: "DENIED",
          details: `Action [${requestedAction}] execution blocked by policy: ${(output.message as string) || 'Disabled operation'}. ExecutionId: [${executionId}]. ${resolvedApprovalId ? `LinkedApprovalTicket: [${resolvedApprovalId}].` : ''}`,
          agentId: agent!.id,
        },
      });

      return NextResponse.json({
        success: true,
        status: "BLOCKED",
        action: requestedAction,
        executionId,
        data: output,
        output, // Backward compatibility alias
        message: (output.message as string) || "Operation blocked by enterprise security policy.",
        agentId: agent!.id,
        agentName: agent!.name,
        assignedRole: agent!.roleName,
        executedAction: requestedAction,
        delegatedPermissionUsed: requiredPermission,
        delegationDetails: agent!.delegatedAuthUsed || null,
        rateLimitLimit: agent!.rateLimit,
        riskClassification: actionDef.riskClassification,
      });
    }

    // Complete single-use lifecycle: transition status from EXECUTING -> EXECUTED
    if (resolvedApprovalId) {
      await prisma.approvalRequest.updateMany({
        where: { id: resolvedApprovalId, status: "EXECUTING" },
        data: {
          status: "EXECUTED",
          reviewerNote: ticket?.reviewerNote
            ? `${ticket.reviewerNote} | Completed in [${executionId}]`
            : `Completed in [${executionId}]`,
        },
      }).catch(() => {});
    }

    // Record Execution Completed
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent!.id,
        actorName: agent!.name,
        action: "AGENT_EXECUTION_COMPLETED",
        resource: resourceTarget,
        status: "SUCCESS",
        details: `Action [${requestedAction}] completed successfully on [${resourceTarget}]. ExecutionId: [${executionId}]. ${resolvedApprovalId ? `LinkedApprovalTicket: [${resolvedApprovalId}].` : ''}`,
        agentId: agent!.id,
        userId: policyResult?.delegationDetails?.grantorId || null,
      },
    });

    // -----------------------------------------------------------------
    // 9. Standardized Success Response Envelope (Step 3.3)
    // -----------------------------------------------------------------
    return NextResponse.json({
      success: true,
      status: "SUCCESS",
      action: requestedAction,
      executionId,
      approvalId: resolvedApprovalId || undefined,
      data: output,
      output, // Backward compatibility alias
      message: `Autonomous task '${requestedAction}' completed successfully within authorized boundaries.`,
      agentId: agent!.id,
      agentName: agent!.name,
      assignedRole: agent!.roleName,
      executedAction: requestedAction,
      delegatedPermissionUsed: requiredPermission,
      delegationDetails: agent!.delegatedAuthUsed || null,
      rateLimitLimit: agent!.rateLimit,
      riskClassification: actionDef.riskClassification,
    });
  } catch (error: unknown) {
    console.error("Agent execution fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        status: "FAILED",
        executionId,
        error: "Machine execution gateway error.",
        message: "Machine execution gateway error.",
      },
      { status: 500 }
    );
  }
}
