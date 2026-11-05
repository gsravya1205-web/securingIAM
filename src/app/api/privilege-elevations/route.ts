import { NextRequest } from "next/server";
import { listPrivilegeElevations, createPrivilegeElevation } from "@/lib/jit";

export const dynamic = "force-dynamic";

/**
 * GET /api/privilege-elevations
 * List all privilege elevations (filtered by user role / status).
 */
export async function GET(request: NextRequest) {
  return listPrivilegeElevations(request);
}

/**
 * POST /api/privilege-elevations
 * Submit a new Human JIT privilege elevation request.
 */
export async function POST(request: NextRequest) {
  return createPrivilegeElevation(request);
}

