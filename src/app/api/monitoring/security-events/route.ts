import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { analyzeSecurityPosture } from "@/lib/security-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitoring/security-events
 * Returns rule-based security posture analysis, active alerts, and real-time threat metrics.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to inspect security monitoring events." },
      { status: 401 }
    );
  }

  const posture = await analyzeSecurityPosture();

  return NextResponse.json({
    success: true,
    posture,
  });
}

