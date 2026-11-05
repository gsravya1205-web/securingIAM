import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { evaluateDelegatedPermission } from "@/lib/delegations";

export interface MachineAuthResult {
  authorized: boolean;
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

  // 6. Granular RBAC Permissions & Delegated Authorization Check
  const permissions = agent.role.permissions.map((p) => p.permission.code);
  const hasStaticPermission = options.requiredPermission ? permissions.includes(options.requiredPermission) : true;

  // Check if an ACTIVE Delegation grants this permission to this agent
  let delegationCheck: any = null;
  if (options.requiredPermission) {
    delegationCheck = await evaluateDelegatedPermission(
      agent.id,
      options.requiredPermission,
      options.resource
    );
  }

  if (delegationCheck?.authorized && delegationCheck?.delegation && delegationCheck?.grantor) {
    // Authorized via Delegation grant
    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: "DELEGATED_ACCESS_ALLOWED",
        resource: options.resource,
        status: "SUCCESS",
        details: `Authorized autonomous execution via Delegation [${delegationCheck.delegation.id}] granted by [${delegationCheck.grantor.name}] for permission [${options.requiredPermission}]. Scope: ${delegationCheck.delegation.scope || "Global"}`,
        agentId: agent.id,
        userId: delegationCheck.grantor.id,
      },
    });

    return {
      authorized: true,
      agent: {
        id: agent.id,
        name: agent.name,
        roleName: agent.role.name,
        permissions: Array.from(new Set([...permissions, options.requiredPermission!])),
        rateLimit: agent.rateLimit,
        status: agent.status,
        delegatedAuthUsed: {
          delegationId: delegationCheck.delegation.id,
          grantorId: delegationCheck.grantor.id,
          grantorName: delegationCheck.grantor.name,
          scope: delegationCheck.delegation.scope,
          permission: options.requiredPermission!,
        },
      },
    };
  }

  if (options.requiredPermission && !hasStaticPermission) {
    // Denial path: scope mismatch or lack of delegation
    let denialAction = options.action;
    let denialDetails = `RBAC Violation: Agent [${agent.name}] with role [${agent.role.name}] lacks delegated permission [${options.requiredPermission}].`;

    if (delegationCheck?.reason === "SCOPE_MISMATCH") {
      denialAction = "DELEGATED_ACCESS_DENIED";
      denialDetails = `Delegated permission [${options.requiredPermission}] exists but target resource [${options.resource}] is outside permitted scope [${delegationCheck.delegation?.scope}].`;
    } else {
      denialAction = "DELEGATED_ACCESS_DENIED";
      denialDetails = `RBAC & Delegation Violation: Agent [${agent.name}] lacks permission [${options.requiredPermission}] and has no active delegation grant for this resource.`;
    }

    await prisma.auditLog.create({
      data: {
        actorType: "AGENT",
        actorId: agent.id,
        actorName: agent.name,
        action: denialAction,
        resource: options.resource,
        status: "DENIED",
        details: denialDetails,
        agentId: agent.id,
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: `Access Denied: Machine identity lacks required capability '${options.requiredPermission}'.`,
          agent: agent.name,
          role: agent.role.name,
          requiredPermission: options.requiredPermission,
          reason: delegationCheck?.reason || "NO_ACTIVE_DELEGATION",
          delegationReason: delegationCheck?.reason || "NO_ACTIVE_DELEGATION",
        },
        { status: 403 }
      ),
    };
  }

  // 7. Successful Machine Authorization -> Log Audit Success
  await prisma.auditLog.create({
    data: {
      actorType: "AGENT",
      actorId: agent.id,
      actorName: agent.name,
      action: options.action,
      resource: options.resource,
      status: "SUCCESS",
      details: `Authorized autonomous machine execution for [${agent.name}] under role [${agent.role.name}].`,
      agentId: agent.id,
    },
  });

  return {
    authorized: true,
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
