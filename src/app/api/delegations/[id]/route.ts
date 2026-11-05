import { NextRequest } from "next/server";
import { getDelegationById, revokeDelegation } from "@/lib/delegations";

interface RouteParams {
  params: {
    id: string;
  };
}

// GET /api/delegations/[id] -> Retrieve single delegation
export async function GET(request: NextRequest, { params }: RouteParams) {
  return getDelegationById(params.id, request);
}

// DELETE /api/delegations/[id] -> Revoke delegation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return revokeDelegation(params.id, request);
}

// PATCH /api/delegations/[id] -> Support revocation via PATCH
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return revokeDelegation(params.id, request);
}

