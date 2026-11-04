import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";

// Compliance and analytical reports catalog
const reportsData = [
  { id: "rep-001", title: "Q3 SOC 2 Type II Access Review", status: "COMPLIANT", date: "2026-10-15" },
  { id: "rep-002", title: "Zero-Trust Agent Token Rotation Log", status: "VERIFIED", date: "2026-11-01" },
  { id: "rep-003", title: "Automated Privilege Escalation Scan", status: "NO_ANOMALIES", date: "2026-11-04" },
];

// GET /api/reports -> Requires reports.read (Admin, Manager, Employee all permitted)
export async function GET() {
  const auth = await authorizeRequest({
    requiredPermission: "reports.read",
    action: "REPORT_READ",
    resource: "Compliance:Reports",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  return NextResponse.json({
    success: true,
    reports: reportsData,
    callerRole: auth.session!.roleName,
  });
}

// POST /api/reports -> Requires reports.create (Admin, Manager allowed; Employee denied)
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "reports.create",
    action: "REPORT_CREATE",
    resource: "Compliance:Reports",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const newReport = {
      id: `rep-${Date.now()}`,
      title: body.title || "Ad-Hoc Security Audit Report",
      status: "GENERATED",
      date: new Date().toISOString().split("T")[0],
    };

    reportsData.push(newReport);

    return NextResponse.json(
      { success: true, message: "Report generated successfully", report: newReport },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to generate report." },
      { status: 500 }
    );
  }
}

