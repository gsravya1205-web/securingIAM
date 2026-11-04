import { NextResponse } from "next/server";
import { getSession, SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
    const hasPermission = session.permissions.includes(options.requiredPermission);

    if (!hasPermission) {
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: options.action,
          resource: options.resource,
          status: "DENIED",
          details: `RBAC Violation: Role [${session.roleName}] lacks required permission [${options.requiredPermission}].`,
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

