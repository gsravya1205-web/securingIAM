import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Compliance and analytical reports catalog
const reportsData = [
  { id: "rep-001", title: "Q3 SOC 2 Type II Access Review", status: "COMPLIANT", date: "2026-10-15" },
  { id: "rep-002", title: "Zero-Trust Agent Token Rotation Log", status: "VERIFIED", date: "2026-11-01" },
  { id: "rep-003", title: "Automated Privilege Escalation Scan", status: "NO_ANOMALIES", date: "2026-11-04" },
];

/**
 * GET /api/reports
 * Supports ?export=json or ?export=csv for compliance evidence bundle downloads.
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeRequest({
    requiredPermission: "reports.read",
    action: "REPORT_READ",
    resource: "Compliance:Reports",
  });

  if (!auth.authorized) {
    return auth.response!;
  }

  const url = new URL(request.url);
  const exportFormat = url.searchParams.get("export");

  if (exportFormat === "json" || exportFormat === "csv") {
    // Generate real compliance bundle from SQLite
    const [
      users,
      agents,
      roles,
      approvals,
      delegations,
      elevations,
      recentAudits,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, email: true, role: { select: { name: true } }, createdAt: true } }),
      prisma.agent.findMany({ select: { id: true, name: true, status: true, role: { select: { name: true } }, rateLimit: true, createdAt: true } }),
      prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }),
      prisma.approvalRequest.findMany({ take: 50, orderBy: { createdAt: "desc" } }),
      prisma.delegation.findMany({ take: 50, orderBy: { createdAt: "desc" } }),
      prisma.privilegeElevation.findMany({ take: 50, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ take: 100, orderBy: { timestamp: "desc" } }),
    ]);

    const reportBundle = {
      title: "SecureID Enterprise Access Governance & Compliance Attestation",
      generatedAt: new Date().toISOString(),
      generatedBy: {
        id: auth.session!.id,
        name: auth.session!.name,
        role: auth.session!.roleName,
      },
      frameworksCovered: [
        "SOC 2 Type II - Trust Services Criteria (CC6.1, CC6.2, CC6.3)",
        "NIST SP 800-207 Zero Trust Architecture",
        "ISO/IEC 27001:2022 Annex A.9 (Access Control)",
      ],
      notice: "Application-generated evidence artifact from live SecureID identity ledger. Not an external accredited audit opinion.",
      inventory: {
        totalUsers: users.length,
        totalAgents: agents.length,
        activeAgents: agents.filter((a) => a.status === "ACTIVE").length,
        users,
        agents,
        roles: roles.map((r) => ({
          name: r.name,
          permissions: r.permissions.map((p) => p.permission.code),
        })),
      },
      governance: {
        approvalsCount: approvals.length,
        delegationsCount: delegations.length,
        elevationsCount: elevations.length,
        recentApprovals: approvals,
        recentDelegations: delegations,
        recentElevations: elevations,
      },
      auditTrailSummary: {
        totalSampled: recentAudits.length,
        allowedCount: recentAudits.filter((a) => a.status === "SUCCESS").length,
        deniedCount: recentAudits.filter((a) => a.status === "DENIED").length,
        recentAudits,
      },
    };

    if (exportFormat === "json") {
      return new NextResponse(JSON.stringify(reportBundle, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="secureid-compliance-evidence.json"',
        },
      });
    } else {
      // Simple CSV export of audit logs
      const header = "id,timestamp,actorType,actorName,action,resource,status\n";
      const rows = recentAudits
        .map(
          (a) =>
            `"${a.id}","${a.timestamp.toISOString()}","${a.actorType}","${a.actorName}","${a.action}","${a.resource}","${a.status}"`
        )
        .join("\n");
      return new NextResponse(header + rows, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="secureid-audit-ledger.csv"',
        },
      });
    }
  }

  return NextResponse.json({
    success: true,
    reports: reportsData,
    callerRole: auth.session!.roleName,
  });
}

/**
 * POST /api/reports -> Requires reports.create (Admin, Manager allowed; Employee denied)
 */
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
