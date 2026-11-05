import { NextRequest, NextResponse } from "next/server";
import {
  listApprovalRequests,
  createApprovalRequest,
  processApprovalDecision,
} from "@/lib/approvals";

// GET /api/approvals -> Retrieve approval requests from SQLite
export async function GET(request: NextRequest) {
  return listApprovalRequests(request);
}

// POST /api/approvals -> Submit a new action requiring human dual-control approval
export async function POST(request: NextRequest) {
  return createApprovalRequest(request);
}

// PATCH /api/approvals -> Render human supervisor verdict (Approve or Reject)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, decision, reviewerNote } = body;

    if (!id || (decision !== "APPROVED" && decision !== "REJECTED")) {
      return NextResponse.json(
        { error: "Valid 'id' and 'decision' ('APPROVED' | 'REJECTED') are required." },
        { status: 400 }
      );
    }

    return await processApprovalDecision(id, decision, reviewerNote);
  } catch (error: unknown) {
    console.error("PATCH /api/approvals error:", error);
    return NextResponse.json(
      { error: "Failed to process approval request." },
      { status: 400 }
    );
  }
}
