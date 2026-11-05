import { NextResponse } from "next/server";
import { getSession, SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { evaluateUserJitPermission } from "@/lib/jit";

export interface AuthorizeResult {
  authorized: boolean;
  session?: SessionPayload;
  response?: NextResponse;
}

/**
 * Server-Side RBAC Guard.
 * Evaluates session validity and enforces granular permission requirements.
 * Automatically records ALLOWED and DENIED security audit logs.
 */
export async function authorizeRequest(options: {
  requiredPermission?: string;
  action: string;
  resource: string;
}): Promise<AuthorizeResult> {
  const session = await getSession();

  // 1. Session verification check
  if (!session) {
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: "unauthenticated",
        actorName: "Anonymous Caller",
        action: options.action,
        resource: options.resource,
        status: "DENIED",
        details: "Blocked unauthenticated API call: Missing or invalid session token.",
      },
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Authentication required. Active session token missing or invalid." },
        { status: 401 }
      ),
    };
  }

  // 2. Granular RBAC permission check
  if (options.requiredPermission) {
    let hasPermission = session.permissions.includes(options.requiredPermission);
    let elevationUsed: {
      id: string;
      permissions: string[];
      requestedRole?: string | null;
      scope?: string | null;
      expiresAt: Date;
    } | null = null;

    if (!hasPermission) {
      // Check for active Human Just-In-Time (JIT) privilege elevation
      const jitEval = await evaluateUserJitPermission(
        session.id,
        options.requiredPermission,
        options.resource
      );
      if (jitEval.hasPermission && jitEval.elevation) {
        hasPermission = true;
        elevationUsed = jitEval.elevation;
      }
    }

    if (!hasPermission) {
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: options.action,
          resource: options.resource,
          status: "DENIED",
          details: `RBAC Violation: Role [${session.roleName}] lacks required permission [${options.requiredPermission}] and no active JIT elevation exists.`,
          userId: session.id,
        },
      });

      return {
        authorized: false,
        session,
        response: NextResponse.json(
          {
            error: `Access Denied: You do not possess the required permission [${options.requiredPermission}].`,
            role: session.roleName,
            requiredPermission: options.requiredPermission,
          },
          { status: 403 }
        ),
      };
    }

    // If access was granted via JIT elevation, record JIT_ACCESS_ALLOWED audit record
    if (elevationUsed) {
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "JIT_ACCESS_ALLOWED",
          resource: options.resource,
          status: "SUCCESS",
          details: `JIT Access Allowed: Elevation ticket [${elevationUsed.id}] granted temporary permission [${options.requiredPermission}] until ${elevationUsed.expiresAt.toISOString()}.`,
          userId: session.id,
        },
      });

      return { authorized: true, session };
    }
  }

  // 3. Authorized -> Log audit success
  await prisma.auditLog.create({
    data: {
      actorType: "USER",
      actorId: session.id,
      actorName: session.name,
      action: options.action,
      resource: options.resource,
      status: "SUCCESS",
      details: `Authorized execution under role [${session.roleName}].`,
      userId: session.id,
    },
  });

  return { authorized: true, session };
}

