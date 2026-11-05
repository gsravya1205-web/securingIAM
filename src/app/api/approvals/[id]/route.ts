import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { processApprovalDecision } from "@/lib/approvals";

interface RouteParams {
  params: {
    id: string;
  };
}

// GET /api/approvals/[id] -> Retrieve single approval request
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const approval = await prisma.approvalRequest.findUnique({
    where: { id: params.id },
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
  });

  if (!approval) {
    return NextResponse.json(
      { error: `Approval request [${params.id}] not found.` },
      { status: 404 }
    );
  }

  // If user is not supervisor, they can only view requests they created
  const isSupervisor =
    session.roleName === "Admin" ||
    session.roleName === "Manager" ||
    session.permissions.includes("roles.manage");

  if (!isSupervisor && (approval.requesterType !== "USER" || approval.requesterId !== session.id)) {
    return NextResponse.json(
      { error: "Access Denied: You cannot view this approval request." },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, approval });
}

// PATCH /api/approvals/[id] -> Render supervisor decision
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const decision = body.decision || body.action;
    const reviewerNote = body.reviewerNote;

    if (!decision || (decision !== "APPROVED" && decision !== "REJECTED")) {
      return NextResponse.json(
        { error: "Valid 'decision' ('APPROVED' | 'REJECTED') is required." },
        { status: 400 }
      );
    }

    return await processApprovalDecision(params.id, decision, reviewerNote);
  } catch (error: unknown) {
    console.error(`PATCH /api/approvals/${params.id} error:`, error);
    return NextResponse.json(
      { error: "Failed to process approval request." },
      { status: 400 }
    );
  }
}

