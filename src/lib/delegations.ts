import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface CreateDelegationInput {
  agentId?: string;
  permissions?: string[];
  scope?: string;
  reason?: string;
  expiresInHours?: number;
  expiresAt?: string;
}

/**
 * Automatically marks active delegations whose expiresAt timestamp is in the past as EXPIRED.
 */
export async function resolveDelegationExpirations(): Promise<number> {
  const now = new Date();
  const pastDue = await prisma.delegation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: {
        lt: now,
      },
    },
    include: {
      agent: { select: { id: true, name: true } },
      grantor: { select: { id: true, name: true } },
    },
  });

  if (pastDue.length === 0) return 0;

  const result = await prisma.delegation.updateMany({
    where: {
      id: { in: pastDue.map((d) => d.id) },
    },
    data: {
      status: "EXPIRED",
    },
  });

  // Audit log each expiration
  for (const del of pastDue) {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: del.grantorId,
        actorName: del.grantor.name,
        action: "DELEGATION_EXPIRED",
        resource: del.scope || `Agent:${del.agent.name}`,
        status: "SUCCESS",
        details: `Delegation grant [${del.id}] to agent [${del.agent.name}] expired automatically. Delegated permissions revoked.`,
        userId: del.grantorId,
        agentId: del.agentId,
      },
    });
  }

  return result.count;
}

/**
 * Evaluates whether an autonomous agent possesses delegated authority for an action and resource.
 * Enforces Zero-Trust constraints:
 * 1. Agent must be ACTIVE.
 * 2. Delegation must be ACTIVE and not expired.
 * 3. Grantor must be an active human user whose current role still has the requested permission.
 * 4. Scope must match the requested resource target.
 */
export async function evaluateDelegatedPermission(
  agentId: string,
  requiredPermission: string,
  resourceTarget?: string
): Promise<{
  authorized: boolean;
  reason?: "NO_ACTIVE_DELEGATION" | "SCOPE_MISMATCH" | "GRANTOR_INVALID" | "AGENT_INACTIVE";
  delegation?: {
    id: string;
    permissions: string[];
    scope: string | null;
    expiresAt: Date;
  };
  grantor?: {
    id: string;
    name: string;
    email: string;
  };
}> {
  // 1. Verify target agent operational status
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, status: true },
  });

  if (!agent || agent.status !== "ACTIVE") {
    return { authorized: false, reason: "AGENT_INACTIVE" };
  }

  // 2. Resolve expirations
  await resolveDelegationExpirations();

  // 3. Find active delegations for this agent
  const activeDelegations = await prisma.delegation.findMany({
    where: {
      agentId,
      status: "ACTIVE",
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      grantor: {
        select: {
          id: true,
          name: true,
          email: true,
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (activeDelegations.length === 0) {
    return { authorized: false, reason: "NO_ACTIVE_DELEGATION" };
  }

  let candidateScopeMismatch: {
    id: string;
    permissions: string[];
    scope: string | null;
    expiresAt: Date;
  } | null = null;

  for (const del of activeDelegations) {
    // 4. Grantor integrity: Grantor must exist and grantor's role must still contain requiredPermission
    const grantor = del.grantor;
    if (!grantor || !grantor.role) {
      continue;
    }

    const grantorPermissions = grantor.role.permissions.map((rp) => rp.permission.code);
    if (!grantorPermissions.includes(requiredPermission)) {
      // Grantor lost the permission -> cannot delegate it anymore
      continue;
    }

    // 5. Check if requested permission is in delegation list
    let parsedPerms: string[] = [];
    try {
      parsedPerms = JSON.parse(del.permissions);
    } catch {
      parsedPerms = del.permissions.split(",").map((p) => p.trim());
    }

    if (!parsedPerms.includes(requiredPermission)) {
      continue;
    }

    // 6. Resource scope check
    if (del.scope && del.scope.trim().length > 0) {
      const scopeClean = del.scope.toLowerCase().trim();
      const targetClean = (resourceTarget || "").toLowerCase().trim();

      const scopeMatches =
        targetClean === scopeClean ||
        targetClean.startsWith(scopeClean) ||
        scopeClean.startsWith(targetClean) ||
        targetClean.includes(scopeClean) ||
        scopeClean.includes(targetClean);

      if (!scopeMatches) {
        candidateScopeMismatch = {
          id: del.id,
          permissions: parsedPerms,
          scope: del.scope,
          expiresAt: del.expiresAt,
        };
        continue;
      }
    }

    // Valid delegation match found!
    return {
      authorized: true,
      delegation: {
        id: del.id,
        permissions: parsedPerms,
        scope: del.scope,
        expiresAt: del.expiresAt,
      },
      grantor: {
        id: grantor.id,
        name: grantor.name,
        email: grantor.email,
      },
    };
  }

  if (candidateScopeMismatch) {
    return {
      authorized: false,
      reason: "SCOPE_MISMATCH",
      delegation: candidateScopeMismatch,
    };
  }

  return { authorized: false, reason: "NO_ACTIVE_DELEGATION" };
}

/**
 * Lists delegations.
 * Supervisors see all organization delegations; standard users see only their own grants.
 */
export async function listDelegations(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to view delegation registry." },
      { status: 401 }
    );
  }

  // Auto-expire past-due grants
  await resolveDelegationExpirations();

  const isSupervisor =
    session.roleName === "Admin" ||
    session.roleName === "Manager" ||
    session.permissions.includes("roles.manage");

  const whereClause = isSupervisor
    ? {}
    : {
        grantorId: session.id,
      };

  const delegations = await prisma.delegation.findMany({
    where: whereClause,
    include: {
      grantor: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { name: true } },
        },
      },
      agent: {
        select: {
          id: true,
          name: true,
          status: true,
          role: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    delegations: delegations.map((d) => {
      let perms: string[] = [];
      try {
        perms = JSON.parse(d.permissions);
      } catch {
        perms = d.permissions.split(",").map((p) => p.trim());
      }
      return {
        ...d,
        permissionsList: perms,
      };
    }),
    currentUserId: session.id,
    currentUserRole: session.roleName,
    isSupervisor,
  });
}

/**
 * Retrieves a single delegation by ID.
 */
export async function getDelegationById(delegationId: string, request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  await resolveDelegationExpirations();

  const delegation = await prisma.delegation.findUnique({
    where: { id: delegationId },
    include: {
      grantor: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { name: true } },
        },
      },
      agent: {
        select: {
          id: true,
          name: true,
          status: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  if (!delegation) {
    return NextResponse.json({ error: `Delegation [${delegationId}] not found.` }, { status: 404 });
  }

  const isSupervisor =
    session.roleName === "Admin" ||
    session.roleName === "Manager" ||
    session.permissions.includes("roles.manage");

  if (!isSupervisor && delegation.grantorId !== session.id) {
    return NextResponse.json(
      { error: "Access Denied: You cannot inspect delegations created by other users." },
      { status: 403 }
    );
  }

  let perms: string[] = [];
  try {
    perms = JSON.parse(delegation.permissions);
  } catch {
    perms = delegation.permissions.split(",").map((p) => p.trim());
  }

  return NextResponse.json({
    success: true,
    delegation: {
      ...delegation,
      permissionsList: perms,
    },
  });
}

/**
 * Creates a new human-to-agent delegation grant in SQLite.
 * Enforces strict Permission Boundaries (User cannot delegate what they do not possess).
 */
export async function createDelegation(request: NextRequest) {
  // 1. Reject Machine Agents attempting to create human delegations
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Access Denied: Autonomous AI agents cannot create or issue human delegation grants." },
      { status: 403 }
    );
  }

  // 2. Authenticate Human User Session
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required. Active human session token missing or invalid." },
      { status: 401 }
    );
  }

  try {
    const body: CreateDelegationInput = await request.json();
    const { agentId, permissions, scope, reason, expiresInHours, expiresAt } = body;

    // 3. Validate Inputs
    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json({ error: "agentId is required." }, { status: 400 });
    }

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { error: "permissions must be a non-empty array of valid permission codes." },
        { status: 400 }
      );
    }

    const cleanReason = (reason || "").trim();
    if (!cleanReason || cleanReason.length < 5) {
      return NextResponse.json(
        { error: "A meaningful business reason (at least 5 characters) is required." },
        { status: 400 }
      );
    }

    // 4. Validate Grantor exists and fetch current database permissions
    const grantorUser = await prisma.user.findUnique({
      where: { id: session.id },
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

    if (!grantorUser) {
      return NextResponse.json({ error: "Grantor human user not found in database." }, { status: 401 });
    }

    const grantorEffectivePermissions = grantorUser.role.permissions.map(
      (rp) => rp.permission.code
    );

    // 5. Validate Target Agent exists and is ACTIVE
    const targetAgent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, status: true },
    });

    if (!targetAgent) {
      return NextResponse.json({ error: `Target AI Agent [${agentId}] not found.` }, { status: 404 });
    }

    if (targetAgent.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: `Cannot delegate to agent [${targetAgent.name}]. Agent status is ${targetAgent.status} (only ACTIVE agents can receive delegations).`,
        },
        { status: 400 }
      );
    }

    // 6. Validate each requested permission exists in the system database
    const dbPermissions = await prisma.permission.findMany({
      where: { code: { in: permissions } },
      select: { code: true },
    });
    const validCodes = new Set(dbPermissions.map((p) => p.code));

    const invalidPermissions = permissions.filter((p) => !validCodes.has(p));
    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid permissions specified: ${invalidPermissions.join(", ")}. Permission does not exist in registry.`,
        },
        { status: 400 }
      );
    }

    // 7. Enforce Permission Boundary: Grantor CANNOT delegate permissions they do not possess
    const unauthorizedPermissions = permissions.filter(
      (p) => !grantorEffectivePermissions.includes(p)
    );

    if (unauthorizedPermissions.length > 0) {
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "DELEGATION_AUTHORIZATION_FAILED",
          resource: `Agent:${targetAgent.name}`,
          status: "DENIED",
          details: `Privilege escalation blocked: User [${session.name}] (${session.roleName}) attempted to delegate unassigned permissions: ${unauthorizedPermissions.join(", ")}.`,
          userId: session.id,
          agentId: targetAgent.id,
        },
      });

      return NextResponse.json(
        {
          error: `Permission boundary violation: You cannot delegate permissions you do not possess (${unauthorizedPermissions.join(", ")}).`,
          grantorRole: session.roleName,
          unauthorizedPermissions,
        },
        { status: 403 }
      );
    }

    // 8. Determine Expiration Timestamp (Strict TTL: max 72 hours)
    const MAX_DURATION_HOURS = 72;
    let expiresAtDate: Date;

    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (isNaN(parsed.getTime()) || parsed <= new Date()) {
        return NextResponse.json(
          { error: "Invalid expiresAt date. Must be a valid future timestamp." },
          { status: 400 }
        );
      }
      const maxAllowed = new Date(Date.now() + MAX_DURATION_HOURS * 3600 * 1000);
      if (parsed > maxAllowed) {
        return NextResponse.json(
          {
            error: `Delegation duration exceeds policy maximum of ${MAX_DURATION_HOURS} hours.`,
          },
          { status: 400 }
        );
      }
      expiresAtDate = parsed;
    } else if (expiresInHours && expiresInHours > 0) {
      if (expiresInHours > MAX_DURATION_HOURS) {
        return NextResponse.json(
          {
            error: `Delegation duration (${expiresInHours}h) exceeds maximum allowed ${MAX_DURATION_HOURS} hours.`,
          },
          { status: 400 }
        );
      }
      expiresAtDate = new Date(Date.now() + expiresInHours * 3600 * 1000);
    } else {
      // Default duration: 2 hours
      expiresAtDate = new Date(Date.now() + 2 * 3600 * 1000);
    }

    // 9. Persist Delegation in SQLite
    const newDelegation = await prisma.delegation.create({
      data: {
        grantorId: session.id, // Strictly derived from session, NEVER from client
        agentId: targetAgent.id,
        permissions: JSON.stringify(permissions),
        scope: scope?.trim() || null,
        reason: cleanReason,
        status: "ACTIVE",
        expiresAt: expiresAtDate,
      },
      include: {
        grantor: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, name: true, status: true } },
      },
    });

    // 10. Audit Log Event
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "DELEGATION_CREATED",
        resource: scope?.trim() || `Agent:${targetAgent.name}`,
        status: "SUCCESS",
        details: `Grantor [${session.name}] delegated [${permissions.join(", ")}] to agent [${targetAgent.name}]. Scope: ${scope || "Global"}, TTL: expires at ${expiresAtDate.toISOString()}. Reason: ${cleanReason}`,
        userId: session.id,
        agentId: targetAgent.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        delegation: {
          ...newDelegation,
          permissionsList: permissions,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Create delegation error:", error);
    return NextResponse.json(
      { error: "Internal server error while creating delegation grant." },
      { status: 500 }
    );
  }
}

/**
 * Revokes an existing delegation grant.
 * Must be executed by the original grantor or an authorized Administrator.
 */
export async function revokeDelegation(delegationId: string, request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to revoke delegation." },
      { status: 401 }
    );
  }

  const delegation = await prisma.delegation.findUnique({
    where: { id: delegationId },
    include: {
      grantor: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });

  if (!delegation) {
    return NextResponse.json({ error: `Delegation [${delegationId}] not found.` }, { status: 404 });
  }

  // Permission check: Original grantor or Administrator with roles.manage
  const isOriginalGrantor = delegation.grantorId === session.id;
  const isAdmin = session.roleName === "Admin" || session.permissions.includes("roles.manage");

  if (!isOriginalGrantor && !isAdmin) {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "DELEGATION_REVOCATION_UNAUTHORIZED",
        resource: `Delegation:${delegationId}`,
        status: "DENIED",
        details: `Access Denied: User [${session.name}] lacks authority to revoke delegation granted by [${delegation.grantor.name}].`,
        userId: session.id,
      },
    });

    return NextResponse.json(
      { error: "Access Denied: Only the original grantor or an Administrator can revoke this delegation." },
      { status: 403 }
    );
  }

  if (delegation.status === "REVOKED") {
    return NextResponse.json({
      success: true,
      message: "Delegation is already revoked.",
      delegation,
    });
  }

  // Atomic update to REVOKED status
  const updatedDelegation = await prisma.delegation.update({
    where: { id: delegationId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
    include: {
      grantor: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
    },
  });

  // Audit log revocation
  await prisma.auditLog.create({
    data: {
      actorType: "USER",
      actorId: session.id,
      actorName: session.name,
      action: "DELEGATION_REVOKED",
      resource: delegation.scope || `Agent:${delegation.agent.name}`,
      status: "SUCCESS",
      details: `Delegation grant [${delegation.id}] revoked by [${session.name}] (${session.roleName}). Delegated authority immediately terminated.`,
      userId: session.id,
      agentId: delegation.agentId,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Delegation revoked successfully.",
    delegation: updatedDelegation,
  });
}

