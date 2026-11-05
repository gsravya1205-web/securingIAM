import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, SessionPayload } from "@/lib/session";

export interface CreateJitInput {
  permissions?: string[];
  requestedRole?: string;
  scope?: string;
  justification?: string;
  durationMinutes?: number;
}

export interface JitEvaluationResult {
  hasPermission: boolean;
  elevation?: {
    id: string;
    permissions: string[];
    requestedRole?: string | null;
    scope?: string | null;
    expiresAt: Date;
    activatedAt?: Date | null;
  };
  reason?: string;
}

/**
 * Automatically marks active privilege elevations whose expiresAt timestamp is in the past as EXPIRED.
 */
export async function resolveJitExpirations(): Promise<number> {
  const now = new Date();
  const pastDue = await prisma.privilegeElevation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: {
        lt: now,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (pastDue.length === 0) return 0;

  const result = await prisma.privilegeElevation.updateMany({
    where: {
      id: { in: pastDue.map((e) => e.id) },
    },
    data: {
      status: "EXPIRED",
    },
  });

  for (const el of pastDue) {
    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        actorId: "jit-expiration-engine",
        actorName: "SecureID ZSP Engine",
        action: "JIT_PRIVILEGE_EXPIRED",
        resource: el.scope || "Privilege:Elevation",
        status: "SUCCESS",
        details: `Temporary privilege elevation [${el.id}] for user [${el.user.name}] (${el.user.email}) expired automatically. Elevated permissions revoked under Zero Standing Privilege policy.`,
        userId: el.userId,
      },
    });
  }

  return result.count;
}

/**
 * Evaluates whether an authenticated human user possesses active temporary JIT privileges
 * for a specific permission code and optional resource.
 * Enforces Zero Standing Privilege:
 * 1. Checks SQLite database directly for ACTIVE elevation tickets.
 * 2. Lazily and immediately expires any elevation whose TTL has passed.
 * 3. Validates permission code and scope boundaries.
 */
export async function evaluateUserJitPermission(
  userId: string,
  requiredPermission: string,
  resource?: string
): Promise<JitEvaluationResult> {
  const now = new Date();

  // Find all ACTIVE elevations for this user
  const activeElevations = await prisma.privilegeElevation.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (activeElevations.length === 0) {
    return { hasPermission: false, reason: "NO_ACTIVE_ELEVATION" };
  }

  for (const el of activeElevations) {
    // 1. Immediate expiration check on authorization check (no reliance on background cron)
    if (el.expiresAt && el.expiresAt <= now) {
      await prisma.privilegeElevation.update({
        where: { id: el.id },
        data: { status: "EXPIRED" },
      });

      await prisma.auditLog.create({
        data: {
          actorType: "SYSTEM",
          actorId: "jit-rbac-guard",
          actorName: "SecureID RBAC Guard",
          action: "JIT_PRIVILEGE_EXPIRED",
          resource: el.scope || "Privilege:Elevation",
          status: "SUCCESS",
          details: `Temporary JIT privilege [${el.id}] expired during access evaluation for user [${el.user.name}]. Permissions immediately revoked.`,
          userId: el.userId,
        },
      });

      continue; // Expired, cannot grant access
    }

    // 2. Parse permissions list
    let grantedPerms: string[] = [];
    try {
      grantedPerms = JSON.parse(el.permissions);
    } catch {
      grantedPerms = el.permissions.split(",").map((s) => s.trim());
    }

    // 3. Match required permission
    if (grantedPerms.includes(requiredPermission)) {
      // 4. Validate scope constraint if defined
      if (el.scope && resource) {
        const cleanScope = el.scope.toLowerCase().trim();
        const cleanRes = resource.toLowerCase().trim();
        if (cleanScope !== "*" && !cleanRes.includes(cleanScope) && !cleanScope.includes(cleanRes)) {
          return { hasPermission: false, reason: "SCOPE_MISMATCH" };
        }
      }

      return {
        hasPermission: true,
        elevation: {
          id: el.id,
          permissions: grantedPerms,
          requestedRole: el.requestedRole,
          scope: el.scope,
          expiresAt: el.expiresAt!,
          activatedAt: el.activatedAt,
        },
      };
    }
  }

  return { hasPermission: false, reason: "PERMISSION_NOT_IN_ELEVATION" };
}

/**
 * Submits a new Human Just-In-Time Privilege Elevation request (POST /api/privilege-elevations).
 */
export async function createPrivilegeElevation(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();

  // 1. Must be an authenticated human session
  if (!session) {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: "unauthenticated",
        actorName: "Anonymous Caller",
        action: "JIT_REQUEST_CREATED",
        resource: "Privilege:Elevation",
        status: "DENIED",
        details: "Blocked unauthenticated privilege elevation request: Session missing or invalid.",
      },
    });

    return NextResponse.json(
      { error: "Authentication required. You must sign in to request temporary elevation." },
      { status: 401 }
    );
  }

  try {
    const body: CreateJitInput = await request.json().catch(() => ({}));
    const { permissions, requestedRole, scope, justification, durationMinutes } = body;

    // 2. Validate requested permissions
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { error: "A non-empty array of valid 'permissions' is required." },
        { status: 400 }
      );
    }

    // Validate that each requested permission exists in the database
    const dbPermissions = await prisma.permission.findMany({
      where: { code: { in: permissions } },
    });

    const validCodes = new Set(dbPermissions.map((p) => p.code));
    const invalidCodes = permissions.filter((p) => !validCodes.has(p));

    if (invalidCodes.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid permission code(s) specified: ${invalidCodes.join(", ")}. Must exist in permission registry.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate business justification
    const cleanJustification = String(justification || "").trim();
    if (!cleanJustification || cleanJustification.length < 5) {
      return NextResponse.json(
        { error: "A meaningful business justification (minimum 5 characters) is required for privilege elevation." },
        { status: 400 }
      );
    }

    // 4. Validate duration (bounded between 5 minutes and 240 minutes / 4 hours)
    const duration = Number(durationMinutes) || 60;
    if (isNaN(duration) || duration < 5 || duration > 240) {
      return NextResponse.json(
        { error: "Requested duration must be between 5 and 240 minutes (maximum 4 hours per Zero Standing Privilege policy)." },
        { status: 400 }
      );
    }

    // 5. Ensure user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: { role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Authenticated user record not found." }, { status: 404 });
    }

    // 6. Create persistent PENDING elevation record
    const elevation = await prisma.privilegeElevation.create({
      data: {
        userId: session.id,
        permissions: JSON.stringify(permissions),
        requestedRole: requestedRole || null,
        scope: scope ? String(scope).trim() : null,
        justification: cleanJustification,
        requestedDuration: duration,
        status: "PENDING",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    // 7. Audit log event
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.id,
        actorName: session.name,
        action: "JIT_REQUEST_CREATED",
        resource: scope || `User:${session.email}`,
        status: "SUCCESS",
        details: `User [${session.name}] requested temporary JIT elevation [${elevation.id}] for permissions: ${permissions.join(", ")} (Duration: ${duration}m). Justification: ${cleanJustification}`,
        userId: session.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Temporary privilege elevation request submitted successfully. Awaiting supervisor approval.",
        elevation: {
          id: elevation.id,
          userId: elevation.userId,
          userName: elevation.user.name,
          userEmail: elevation.user.email,
          userPermanentRole: elevation.user.role.name,
          permissions,
          requestedRole: elevation.requestedRole,
          scope: elevation.scope,
          justification: elevation.justification,
          requestedDuration: elevation.requestedDuration,
          status: elevation.status,
          createdAt: elevation.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("createPrivilegeElevation error:", error);
    return NextResponse.json(
      { error: "Internal server error while processing privilege elevation request." },
      { status: 500 }
    );
  }
}

/**
 * Lists privilege elevation requests with optional filtering (GET /api/privilege-elevations).
 */
export async function listPrivilegeElevations(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to view privilege elevation records." },
      { status: 401 }
    );
  }

  // Auto-resolve any expired active elevations before listing
  await resolveJitExpirations();

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status")?.toUpperCase();
  const userIdParam = url.searchParams.get("userId");

  const whereClause: Record<string, unknown> = {};

  if (statusParam && statusParam !== "ALL") {
    whereClause.status = statusParam;
  }

  // Employees can only view their own requests unless they are supervisors/admins
  const isSupervisor = session.roleName === "Admin" || session.roleName === "Manager" || session.permissions.includes("roles.manage");
  if (!isSupervisor) {
    whereClause.userId = session.id;
  } else if (userIdParam) {
    whereClause.userId = userIdParam;
  }

  const elevations = await prisma.privilegeElevation.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { id: true, name: true } },
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const formatted = elevations.map((el) => {
    let perms: string[] = [];
    try {
      perms = JSON.parse(el.permissions);
    } catch {
      perms = el.permissions.split(",").map((s) => s.trim());
    }

    const now = new Date();
    let remainingMinutes: number | null = null;
    if (el.status === "ACTIVE" && el.expiresAt) {
      remainingMinutes = Math.max(0, Math.round((el.expiresAt.getTime() - now.getTime()) / 60000));
    }

    return {
      id: el.id,
      userId: el.userId,
      userName: el.user.name,
      userEmail: el.user.email,
      userPermanentRole: el.user.role.name,
      permissions: perms,
      requestedRole: el.requestedRole,
      scope: el.scope,
      justification: el.justification,
      status: el.status,
      reviewerId: el.reviewerId,
      reviewerName: el.reviewer?.name || null,
      reviewerEmail: el.reviewer?.email || null,
      reviewerRole: el.reviewer?.role?.name || null,
      reviewerNote: el.reviewerNote,
      requestedDuration: el.requestedDuration,
      approvedDuration: el.approvedDuration,
      remainingMinutes,
      activatedAt: el.activatedAt,
      expiresAt: el.expiresAt,
      revokedAt: el.revokedAt,
      createdAt: el.createdAt,
      updatedAt: el.updatedAt,
    };
  });

  return NextResponse.json({
    success: true,
    count: formatted.length,
    elevations: formatted,
    currentUser: {
      id: session.id,
      name: session.name,
      role: session.roleName,
      isSupervisor,
    },
  });
}

/**
 * Retrieves a single elevation record by ID (GET /api/privilege-elevations/[id]).
 */
export async function getPrivilegeElevationById(id: string): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to inspect privilege elevation details." },
      { status: 401 }
    );
  }

  const el = await prisma.privilegeElevation.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { id: true, name: true } },
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!el) {
    return NextResponse.json({ error: "Privilege elevation record not found." }, { status: 404 });
  }

  // Non-supervisors can only inspect their own tickets
  const isSupervisor = session.roleName === "Admin" || session.roleName === "Manager" || session.permissions.includes("roles.manage");
  if (!isSupervisor && el.userId !== session.id) {
    return NextResponse.json({ error: "Unauthorized: You may only inspect your own elevation requests." }, { status: 403 });
  }

  // Auto-expire check
  if (el.status === "ACTIVE" && el.expiresAt && el.expiresAt < new Date()) {
    await prisma.privilegeElevation.update({
      where: { id: el.id },
      data: { status: "EXPIRED" },
    });
    el.status = "EXPIRED";
  }

  let perms: string[] = [];
  try {
    perms = JSON.parse(el.permissions);
  } catch {
    perms = el.permissions.split(",").map((s) => s.trim());
  }

  return NextResponse.json({
    success: true,
    elevation: {
      id: el.id,
      userId: el.userId,
      userName: el.user.name,
      userEmail: el.user.email,
      userPermanentRole: el.user.role.name,
      permissions: perms,
      requestedRole: el.requestedRole,
      scope: el.scope,
      justification: el.justification,
      status: el.status,
      reviewerId: el.reviewerId,
      reviewerName: el.reviewer?.name || null,
      reviewerNote: el.reviewerNote,
      requestedDuration: el.requestedDuration,
      approvedDuration: el.approvedDuration,
      activatedAt: el.activatedAt,
      expiresAt: el.expiresAt,
      revokedAt: el.revokedAt,
      createdAt: el.createdAt,
      updatedAt: el.updatedAt,
    },
  });
}

/**
 * Reviews or revokes a privilege elevation (PATCH /api/privilege-elevations/[id]).
 * Action can be "APPROVE", "REJECT", or "REVOKE".
 */
export async function updatePrivilegeElevation(
  id: string,
  request: NextRequest
): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to review or revoke privilege elevations." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || body.decision || "").toUpperCase();
    const reviewerNote = body.reviewerNote || body.reason || null;
    const approvedDuration = Number(body.approvedDuration) || null;

    if (!["APPROVE", "APPROVED", "REJECT", "REJECTED", "REVOKE", "REVOKED"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'APPROVE', 'REJECT', or 'REVOKE'." },
        { status: 400 }
      );
    }

    const elevation = await prisma.privilegeElevation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!elevation) {
      return NextResponse.json({ error: "Privilege elevation record not found." }, { status: 404 });
    }

    // -------------------------------------------------------------
    // HANDLE REVOCATION OF ACTIVE ELEVATIONS
    // -------------------------------------------------------------
    if (action === "REVOKE" || action === "REVOKED") {
      // Must be Admin or Manager with roles.manage
      const canRevoke = session.roleName === "Admin" || session.permissions.includes("roles.manage");
      if (!canRevoke) {
        return NextResponse.json(
          { error: "Unauthorized: Only administrators may revoke active privilege elevations." },
          { status: 403 }
        );
      }

      if (elevation.status !== "ACTIVE") {
        return NextResponse.json(
          { error: `Cannot revoke elevation with status '${elevation.status}'. Only ACTIVE elevations can be revoked.` },
          { status: 400 }
        );
      }

      const revokedAt = new Date();
      const updated = await prisma.privilegeElevation.update({
        where: { id },
        data: {
          status: "REVOKED",
          revokedAt,
          reviewerNote: reviewerNote || elevation.reviewerNote,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "JIT_PRIVILEGE_REVOKED",
          resource: elevation.scope || `User:${elevation.user.email}`,
          status: "SUCCESS",
          details: `Administrator [${session.name}] revoked active JIT privilege elevation [${elevation.id}] for user [${elevation.user.name}]. Elevated permissions stopped immediately. Note: ${reviewerNote || "Manual revocation"}`,
          userId: elevation.userId,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Privilege elevation revoked immediately. Temporary permissions deactivated.",
        elevation: updated,
      });
    }

    // -------------------------------------------------------------
    // HANDLE APPROVAL / REJECTION (SUPERVISORY REVIEW)
    // -------------------------------------------------------------
    // 1. Separation of Duties: Requester CANNOT review their own ticket
    if (elevation.userId === session.id) {
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "JIT_UNAUTHORIZED_REVIEW",
          resource: `Elevation:${elevation.id}`,
          status: "DENIED",
          details: `Separation of Duties violation: Requester [${session.name}] attempted to review their own elevation request [${elevation.id}].`,
          userId: session.id,
        },
      });

      return NextResponse.json(
        {
          error: "Separation of Duties violation: You cannot approve or reject your own privilege elevation request.",
        },
        { status: 403 }
      );
    }

    // 2. Supervisory Authority Check: Must be Admin or Manager (governance authority)
    const isSupervisor = session.roleName === "Admin" || session.roleName === "Manager" || session.permissions.includes("roles.manage");
    if (!isSupervisor) {
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "JIT_UNAUTHORIZED_REVIEW",
          resource: `Elevation:${elevation.id}`,
          status: "DENIED",
          details: `Unauthorized reviewer [${session.name}] lacks governance permissions to approve human elevation requests.`,
          userId: session.id,
        },
      });

      return NextResponse.json(
        { error: "Access Denied: You do not possess supervisory authority to review privilege elevations." },
        { status: 403 }
      );
    }

    // 3. Status must be PENDING
    if (elevation.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Cannot review request: Elevation is already resolved with status '${elevation.status}'.`,
        },
        { status: 409 }
      );
    }

    // 4. Atomic update decision
    const isApprove = action === "APPROVE" || action === "APPROVED";
    const now = new Date();

    if (isApprove) {
      // Clamped duration: between 5 and 240 minutes
      const finalDuration = Math.min(
        240,
        Math.max(5, approvedDuration || elevation.requestedDuration || 60)
      );
      const expiresAt = new Date(now.getTime() + finalDuration * 60 * 1000);

      const updateResult = await prisma.privilegeElevation.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "ACTIVE",
          reviewerId: session.id,
          reviewerNote: reviewerNote || null,
          approvedDuration: finalDuration,
          activatedAt: now,
          expiresAt,
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          { error: "Conflict: This elevation request has already been reviewed or resolved by another administrator." },
          { status: 409 }
        );
      }

      const updated = await prisma.privilegeElevation.findUnique({
        where: { id },
      });

      // Audit logs
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "JIT_REQUEST_APPROVED",
          resource: elevation.scope || `User:${elevation.user.email}`,
          status: "SUCCESS",
          details: `Supervisor [${session.name}] approved JIT elevation [${elevation.id}] for user [${elevation.user.name}]. Approved duration: ${finalDuration}m (Expires at: ${expiresAt.toISOString()}). Note: ${reviewerNote || "Approved"}`,
          userId: elevation.userId,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: elevation.userId,
          actorName: elevation.user.name,
          action: "JIT_PRIVILEGE_ACTIVATED",
          resource: elevation.scope || `User:${elevation.user.email}`,
          status: "SUCCESS",
          details: `Temporary JIT privileges activated for user [${elevation.user.name}]. Permanent role [${elevation.user.role.name}] preserved under Zero Standing Privilege. Access window: ${finalDuration} minutes.`,
          userId: elevation.userId,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Privilege elevation approved. Elevated permissions are now ACTIVE for ${finalDuration} minutes.`,
        elevation: updated,
      });
    } else {
      // REJECT
      const updateResult = await prisma.privilegeElevation.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewerId: session.id,
          reviewerNote: reviewerNote || null,
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          { error: "Conflict: This elevation request has already been reviewed or resolved by another administrator." },
          { status: 409 }
        );
      }

      const updated = await prisma.privilegeElevation.findUnique({
        where: { id },
      });

      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "JIT_REQUEST_REJECTED",
          resource: elevation.scope || `User:${elevation.user.email}`,
          status: "SUCCESS",
          details: `Supervisor [${session.name}] rejected JIT elevation [${elevation.id}] for user [${elevation.user.name}]. Note: ${reviewerNote || "Rejected"}`,
          userId: elevation.userId,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Privilege elevation request rejected.",
        elevation: updated,
      });
    }
  } catch (error) {
    console.error("updatePrivilegeElevation error:", error);
    return NextResponse.json(
      { error: "Internal server error while reviewing privilege elevation." },
      { status: 500 }
    );
  }
}

/**
 * Seeds sample initial elevation records if table is empty.
 */
export async function seedInitialElevationsIfEmpty(): Promise<void> {
  const count = await prisma.privilegeElevation.count();
  if (count > 0) return;

  const employee = await prisma.user.findFirst({ where: { role: { name: "Employee" } } });
  const manager = await prisma.user.findFirst({ where: { role: { name: "Manager" } } });
  const admin = await prisma.user.findFirst({ where: { role: { name: "Admin" } } });

  if (employee && admin) {
    const now = Date.now();
    // 1. Pending request: Employee requesting user provisioning capability for user onboarding triage
    await prisma.privilegeElevation.create({
      data: {
        userId: employee.id,
        permissions: JSON.stringify(["users.create", "users.update"]),
        requestedRole: "Admin",
        scope: "Users:Onboarding",
        justification: "Assisting HR onboarding cohort with credential setup and profile provisioning for the new quarterly intake.",
        requestedDuration: 120,
        status: "PENDING",
      },
    });

    // 2. Active elevation: Manager elevated for system roles inspection & emergency audit
    if (manager) {
      await prisma.privilegeElevation.create({
        data: {
          userId: manager.id,
          permissions: JSON.stringify(["roles.manage", "users.delete"]),
          requestedRole: "Admin",
          scope: "Security:RoleMatrix",
          justification: "Performing quarterly SOC 2 least-privilege matrix reconciliation and deprovisioning dormant contractor accounts.",
          requestedDuration: 60,
          approvedDuration: 60,
          status: "ACTIVE",
          reviewerId: admin.id,
          reviewerNote: "Approved for scheduled quarterly audit window.",
          activatedAt: new Date(now - 15 * 60 * 1000), // 15 mins ago
          expiresAt: new Date(now + 45 * 60 * 1000),   // 45 mins remaining
        },
      });
    }
  }
}

