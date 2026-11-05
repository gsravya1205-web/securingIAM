import { NextRequest } from "next/server";
import { getPrivilegeElevationById, updatePrivilegeElevation } from "@/lib/jit";

export const dynamic = "force-dynamic";

/**
 * GET /api/privilege-elevations/[id]
 * Inspect details of a specific elevation ticket.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return getPrivilegeElevationById(params.id);
}

/**
 * PATCH /api/privilege-elevations/[id]
 * Approve, reject, or revoke a privilege elevation.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return updatePrivilegeElevation(params.id, request);
}

