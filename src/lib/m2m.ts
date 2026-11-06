import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { evaluateDelegatedPermission } from "@/lib/delegations";
import { evaluateAccessPolicy, PolicyEvaluationResult } from "@/lib/policy-engine";
import { ensureAgentApprovalTicket } from "@/lib/approvals";

export interface MachineAuthResult {
  authorized: boolean;
  decision?: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
  policyResult?: PolicyEvaluationResult;
  agent?: {
    id: string;
    name: string;
    roleName: string;
    permissions: string[];
    rateLimit: number;
    status: string;
    delegatedAuthUsed?: {
      delegationId: string;
      grantorId: string;
      grantorName: string;
      scope?: string | null;
      permission: string;
    };
  };
  response?: NextResponse;
}

// In-memory token verification cache: SHA-256(rawKey) -> { agentId: string, cachedAt: number }
const tokenCache = new Map<string, { agentId: string; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

// In-memory rate limiting bucket: agentId -> { count: number, windowStart: number }
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

/**
 * Invalidate cached token mappings when credentials rotate or status changes.
 */
export function invalidateTokenCache(agentId?: string) {
  if (agentId) {
    tokenCache.forEach((val, key) => {
      if (val.agentId === agentId) {
        tokenCache.delete(key);
      }
    });
  } else {
    tokenCache.clear();
  }
}

/**
 * Validates and authenticates autonomous AI Machine Agents via Bearer Token.
 * Enforces Zero-Trust principles:
 * 1. Bearer Token presence & CSPRNG format check
 * 2. Salted bcrypt cryptographic hash verification against SQLite
 * 3. Operational status validation (ACTIVE vs. SUSPENDED vs. REVOKED)
 * 4. Machine Rate Limiting (Requests Per Minute threshold)
 * 5. Delegated Granular RBAC Permissions
 * 6. Audit Trail generation (actorType: "AGENT")
 */
export async function authenticateMachineRequest(
  request: NextRequest,
  options: {
    requiredPermission?: string;
    action: string;
    resource: string;
    approvalId?: string;
  }
): Promise<MachineAuthResult> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

  // 1. Check for Bearer token
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: "unauthenticated",
        actorName: "Unknown Autonomous Agent",
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: "Blocked machine execution: Missing or invalid Authorization Bearer token header.",
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Machine authentication required. Header format: 'Authorization: Bearer sec_agent_...'" },
        { status: 401 }
      ),
    };
  }

  const rawKey = authHeader.substring(7).trim();

  if (!rawKey.startsWith("sec_agent_")) {
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: "malformed-token",
        actorName: "Unknown Autonomous Agent",
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: "Malformed machine token: Must begin with prefix 'sec_agent_'.",
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Malformed machine token. Required prefix: 'sec_agent_'." },
        { status: 401 }
      ),
    };
  }

  // 2. Identify Agent via Cache or Bcrypt comparison against active agents
  const keyDigest = crypto.createHash("sha256").update(rawKey).digest("hex");
  let matchedAgentId: string | null = null;

  const cached = tokenCache.get(keyDigest);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    matchedAgentId = cached.agentId;
  } else {
    // Query all agents from database to match hash
    const candidateAgents = await prisma.agent.findMany({
      select: {
        id: true,
        apiKeyHash: true,
      },
    });

    for (const candidate of candidateAgents) {
      const match = await bcrypt.compare(rawKey, candidate.apiKeyHash);
      if (match) {
        matchedAgentId = candidate.id;
        tokenCache.set(keyDigest, { agentId: candidate.id, cachedAt: Date.now() });
        break;
      }
    }
  }

  if (!matchedAgentId) {
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: "invalid-key",
        actorName: "Unregistered Agent",
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: "Cryptographic credential mismatch. Key hash not found in agent registry.",
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Access Denied: Invalid machine API credentials." },
        { status: 401 }
      ),
    };
  }

  // 3. Load full agent details with assigned role and permissions
  const agent = await prisma.agent.findUnique({
    where: { id: matchedAgentId },
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

  if (!agent) {
    tokenCache.delete(keyDigest);
    return {
      authorized: false,
      response: NextResponse.json({ error: "Agent identity not found." }, { status: 404 }),
    };
  }

  // Ensure current key matches agent's active apiKeyHash in SQLite (prevents stale cached keys after rotation)
  const isKeyCurrent = await bcrypt.compare(rawKey, agent.apiKeyHash);
  if (!isKeyCurrent) {
    tokenCache.delete(keyDigest);
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: `Access Denied: Revoked or rotated machine key attempted for [${agent.name}].`,
        agentId: agent.id,
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Access Denied: Machine key has been revoked or rotated." },
        { status: 401 }
      ),
    };
  }

  // 4. Validate Operational Status (Zero-Trust Lifecycle)
  if (agent.status === "REVOKED") {
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: `Access Denied: Machine identity for [${agent.name}] has been permanently REVOKED.`,
        agentId: agent.id,
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Machine identity [${agent.name}] is REVOKED. Actions prohibited.` },
        { status: 403 }
      ),
    };
  }

  if (agent.status === "SUSPENDED") {
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: `Access Denied: Machine authority for [${agent.name}] is currently SUSPENDED by administrator.`,
        agentId: agent.id,
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Machine identity [${agent.name}] is SUSPENDED. Actions held pending administrative reactivation.` },
        { status: 403 }
      ),
    };
  }

  // 5. Rate Limiting Check (Token Bucket / Sliding Window)
  const now = Date.now();
  let bucket = rateLimitBuckets.get(agent.id);

  if (!bucket || now - bucket.windowStart >= 60000) {
    bucket = { count: 1, windowStart: now };
    rateLimitBuckets.set(agent.id, bucket);
  } else {
    bucket.count += 1;
    if (bucket.count > agent.rateLimit) {
      await prisma.auditLog.create({
        data: {
          actorType: "AGENT",
          actorId: agent.id,
          actorName: agent.name,
          action: "RATE_LIMIT_EXCEEDED",
          resource: options.resource,
          status: "DENIED",
          details: `Rate limit violation: Agent [${agent.name}] surpassed allowed quota of ${agent.rateLimit} req/min. Current count: ${bucket.count}.`,
          agentId: agent.id,
        },
      });

      return {
        authorized: false,
        response: NextResponse.json(
          {
            error: `Rate limit quota exceeded. Limit is ${agent.rateLimit} requests/min.`,
            agent: agent.name,
            currentUsage: bucket.count,
            limit: agent.rateLimit,
          },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              "X-RateLimit-Limit": String(agent.rateLimit),
              "X-RateLimit-Remaining": "0",
            },
          }
        ),
      };
    }
  }

  // 6. Centralized Policy Decision Engine (PDP) Evaluation
  // Evaluates permissions, delegation scope, and dual-control approval requirements
  const permissions = agent.role.permissions.map((p) => p.permission.code);
  const actionToEvaluate = options.requiredPermission || options.action;

  // Validate explicitly supplied approval ticket if provided
  if (options.approvalId && typeof options.approvalId === "string" && options.approvalId.trim().length > 0) {
    const suppliedTicket = await prisma.approvalRequest.findUnique({
      where: { id: options.approvalId.trim() },
    });

    if (!suppliedTicket) {
      return {
        authorized: false,
        decision: "DENY",
        agent: {
          id: agent.id,
          name: agent.name,
          roleName: agent.role.name,
          permissions,
          rateLimit: agent.rateLimit,
          status: agent.status,
        },
        response: NextResponse.json(
          { error: `Approval ticket [${options.approvalId}] does not exist.` },
          { status: 403 }
        ),
      };
    }

    if (suppliedTicket.requesterId !== agent.id) {
      return {
        authorized: false,
        decision: "DENY",
        agent: {
          id: agent.id,
          name: agent.name,
          roleName: agent.role.name,
          permissions,
          rateLimit: agent.rateLimit,
          status: agent.status,
        },
        response: NextResponse.json(
          { error: `Approval ticket [${suppliedTicket.id}] was issued to another identity. Cross-agent reuse prohibited.` },
          { status: 403 }
        ),
      };
    }

    if (
      suppliedTicket.targetAction !== options.action &&
      suppliedTicket.targetAction !== actionToEvaluate
    ) {
      return {
        authorized: false,
        decision: "DENY",
        agent: {
          id: agent.id,
          name: agent.name,
          roleName: agent.role.name,
          permissions,
          rateLimit: agent.rateLimit,
          status: agent.status,
        },
        response: NextResponse.json(
          { error: `Approval ticket [${suppliedTicket.id}] is for action [${suppliedTicket.targetAction}], not [${options.action}]. Cross-action reuse prohibited.` },
          { status: 403 }
        ),
      };
    }

    if (
      suppliedTicket.resource !== options.resource &&
      !options.resource.startsWith(suppliedTicket.resource) &&
      !suppliedTicket.resource.startsWith(options.resource)
    ) {
      return {
        authorized: false,
        decision: "DENY",
        agent: {
          id: agent.id,
          name: agent.name,
          roleName: agent.role.name,
          permissions,
          rateLimit: agent.rateLimit,
          status: agent.status,
        },
        response: NextResponse.json(
          { error: `Approval ticket [${suppliedTicket.id}] is scoped to resource [${suppliedTicket.resource}], not [${options.resource}]. Cross-resource reuse prohibited.` },
          { status: 403 }
        ),
      };
    }

    if (suppliedTicket.status !== "APPROVED") {
      const reasonMsg =
        suppliedTicket.status === "EXECUTED"
          ? `Approval ticket [${suppliedTicket.id}] has already been executed. Single-use dual control prevents reuse.`
          : suppliedTicket.status === "EXECUTING"
          ? `Approval ticket [${suppliedTicket.id}] is currently executing in another process. Concurrent execution blocked.`
          : suppliedTicket.status === "FAILED"
          ? `Approval ticket [${suppliedTicket.id}] failed during prior execution attempt. Re-approval required.`
          : `Approval ticket [${suppliedTicket.id}] status is ${suppliedTicket.status}. Execution prohibited.`;

      return {
        authorized: false,
        decision: "DENY",
        agent: {
          id: agent.id,
          name: agent.name,
          roleName: agent.role.name,
          permissions,
          rateLimit: agent.rateLimit,
          status: agent.status,
        },
        response: NextResponse.json(
          { error: reasonMsg },
          { status: 403 }
        ),
      };
    }

    if (suppliedTicket.expiresAt && new Date(suppliedTicket.expiresAt) < new Date()) {
      return {
        authorized: false,
        decision: "DENY",
        agent: {
          id: agent.id,
          name: agent.name,
          roleName: agent.role.name,
          permissions,
          rateLimit: agent.rateLimit,
          status: agent.status,
        },
        response: NextResponse.json(
          { error: `Approval ticket [${suppliedTicket.id}] has expired. Re-approval required.` },
          { status: 403 }
        ),
      };
    }
  }

  // Special-case: Approval request ticket submission by an authenticated agent
  if (!options.requiredPermission && options.action === "APPROVAL_REQUEST_SUBMIT") {
    return {
      authorized: true,
      decision: "ALLOW",
      agent: {
        id: agent.id,
        name: agent.name,
        roleName: agent.role.name,
        permissions,
        rateLimit: agent.rateLimit,
        status: agent.status,
      },
    };
  }

  // Evaluate through Centralized PDP
  const policyResult = await evaluateAccessPolicy({
    subjectId: agent.id,
    subjectType: "AGENT",
    action: actionToEvaluate,
    resource: options.resource,
  });

  // Handle APPROVAL_REQUIRED verdict (e.g. sensitive financial reports or high-risk actions)
  if (policyResult.decision === "APPROVAL_REQUIRED") {
    // Automatically create or reuse existing unexpired pending approval ticket
    const { ticket, isNew } = await ensureAgentApprovalTicket(
      agent,
      actionToEvaluate,
      options.resource,
      policyResult.reason
    );

    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: "APPROVAL_REQUIRED",
        resource: options.resource,
        status: "DENIED",
        details: `Operation paused: Machine execution [${actionToEvaluate}] on [${options.resource}] requires supervisory human approval ticket [${ticket.id}]. ${policyResult.reason}`,
        agentId: agent.id,
      },
    });

    return {
      authorized: false,
      decision: "APPROVAL_REQUIRED",
      policyResult,
      agent: {
        id: agent.id,
        name: agent.name,
        roleName: agent.role.name,
        permissions,
        rateLimit: agent.rateLimit,
        status: agent.status,
      },
      response: NextResponse.json(
        {
          error: "Supervisory Approval Required: Autonomous agent access requires a verified human approval ticket before execution.",
          verdict: "APPROVAL_REQUIRED",
          decision: "APPROVAL_REQUIRED",
          approvalId: ticket.id,
          status: ticket.status,
          action: actionToEvaluate,
          resource: options.resource,
          agent: agent.name,
          role: agent.role.name,
          reason: policyResult.reason,
          policyRule: policyResult.policyRule,
          createdAt: ticket.createdAt.toISOString(),
          isNewTicket: isNew,
        },
        { status: 403 }
      ),
    };
  }

  // Handle DENY verdict (e.g. lack of capability or scope mismatch)
  if (policyResult.decision === "DENY") {
    const isScopeMismatch =
      policyResult.delegationReason === "SCOPE_MISMATCH" ||
      policyResult.reason === "SCOPE_MISMATCH";
    const denialReason = isScopeMismatch
      ? "SCOPE_MISMATCH"
      : policyResult.delegationReason || "NO_ACTIVE_DELEGATION";
    const denialAction = isScopeMismatch ? "DELEGATED_ACCESS_DENIED" : options.action;

    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: denialAction,
        resource: options.resource,
        status: "DENIED",
        details: isScopeMismatch
          ? `Delegated permission [${actionToEvaluate}] exists but target resource [${options.resource}] is outside permitted scope.`
          : `RBAC & Delegation Violation: Agent [${agent.name}] lacks capability [${actionToEvaluate}] on [${options.resource}].`,
        agentId: agent.id,
      },
    });

    return {
      authorized: false,
      decision: "DENY",
      policyResult,
      agent: {
        id: agent.id,
        name: agent.name,
        roleName: agent.role.name,
        permissions,
        rateLimit: agent.rateLimit,
        status: agent.status,
      },
      response: NextResponse.json(
        {
          error: `Access Denied: Machine identity lacks required capability '${actionToEvaluate}'.`,
          verdict: "DENY",
          decision: "DENY",
          agent: agent.name,
          role: agent.role.name,
          requiredPermission: actionToEvaluate,
          reason: denialReason,
          delegationReason: denialReason,
          policyRule: policyResult.policyRule,
        },
        { status: 403 }
      ),
    };
  }

  // Handle ALLOW verdict (via PERMANENT_ROLE or DELEGATION)
  if (policyResult.grantType === "DELEGATION" && policyResult.delegationDetails) {
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: "DELEGATED_ACCESS_ALLOWED",
        resource: options.resource,
        status: "SUCCESS",
        details: `Authorized autonomous execution via Delegation [${policyResult.delegationId}] granted by [${policyResult.delegationDetails.grantorName}] for permission [${actionToEvaluate}]. Scope: ${policyResult.delegationDetails.scope || "Global"}`,
        agentId: agent.id,
        userId: policyResult.delegationDetails.grantorId,
      },
    });

    return {
      authorized: true,
      decision: "ALLOW",
      policyResult,
      agent: {
        id: agent.id,
        name: agent.name,
        roleName: agent.role.name,
        permissions: Array.from(new Set([...permissions, actionToEvaluate])),
        rateLimit: agent.rateLimit,
        status: agent.status,
        delegatedAuthUsed: policyResult.delegationDetails,
      },
    };
  }

  // Standard static role execution ALLOW
  await prisma.auditLog.create({
    data: {
      actorType: "AGENT",
      actorId: agent.id,
      actorName: agent.name,
      action: options.action,
      resource: options.resource,
      status: "SUCCESS",
      details: `Authorized autonomous machine execution for [${agent.name}] under role [${agent.role.name}] via ${policyResult.policyRule}.`,
      agentId: agent.id,
    },
  });

  return {
    authorized: true,
    decision: "ALLOW",
    policyResult,
    agent: {
      id: agent.id,
      name: agent.name,
      roleName: agent.role.name,
      permissions,
      rateLimit: agent.rateLimit,
      status: agent.status,
    },
  };
}
