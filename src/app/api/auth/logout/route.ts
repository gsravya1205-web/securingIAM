import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, destroySession } from "@/lib/session";

export async function POST() {
  try {
    const session = await getSession();

    if (session) {
      // Record logout event in AuditLog
      await prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.id,
          actorName: session.name,
          action: "AUTH_LOGOUT",
          resource: "Auth:Session",
          status: "SUCCESS",
          details: `User ${session.email} logged out securely.`,
          userId: session.id,
        },
      });
    }

    await destroySession();

    return NextResponse.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout route error:", error);
    await destroySession();
    return NextResponse.json({ success: true });
  }
}

