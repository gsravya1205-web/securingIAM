import { NextRequest } from "next/server";
import { listDelegations, createDelegation } from "@/lib/delegations";

// GET /api/delegations -> List active and historical delegations
export async function GET(request: NextRequest) {
  return listDelegations(request);
}

// POST /api/delegations -> Create a new human-to-agent delegation grant
export async function POST(request: NextRequest) {
  return createDelegation(request);
}

