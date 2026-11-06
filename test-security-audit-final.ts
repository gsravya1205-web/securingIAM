import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3040";

interface TestResult {
  id: string;
  category: string;
  title: string;
  expected: string;
  actual: string;
  pass: boolean;
}

async function runAuditTests() {
  console.log("🛡️ =============================================================");
  console.log("🛡️   SECUREID - FINAL SECURITY AUDIT & PRODUCTION VERIFICATION   ");
  console.log("🛡️ =============================================================\n");

  const results: TestResult[] = [];

  function record(id: string, category: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, category, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] (${category}) ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // 0. Base Data Lookups
  const agentRole = await prisma.role.findUnique({
    where: { name: "AI Agent" },
    include: { permissions: { include: { permission: true } } },
  });
  if (!agentRole) throw new Error("AI Agent role not found");

  const adminUser = await prisma.user.findFirst({
    where: { role: { name: "Admin" } },
  });
  if (!adminUser) throw new Error("Admin user not found");

  // Create dedicated security test agent
  const rawApiKey = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(rawApiKey, 10);
  const auditAgent = await prisma.agent.create({
    data: {
      name: `SecurityAuditAgent-${Date.now()}`,
      description: "Agent created specifically for final security audit",
      apiKeyHash,
      status: "ACTIVE",
      rateLimit: 120,
      roleId: agentRole.id,
    },
  });

  // Grant delegations for reports.create and roles.manage to agent
  const reportDelegation = await prisma.delegation.create({
    data: {
      grantorId: adminUser.id,
      agentId: auditAgent.id,
      permissions: JSON.stringify(["reports.create"]),
      scope: "Compliance:Reports",
      reason: "Security audit reports delegation",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400 * 1000),
    },
  });

  const roleDelegation = await prisma.delegation.create({
    data: {
      grantorId: adminUser.id,
      agentId: auditAgent.id,
      permissions: JSON.stringify(["roles.manage"]),
      scope: "Security:Roles",
      reason: "Security audit roles delegation",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400 * 1000),
    },
  });

  try {
    // =================================================================
    // SECTION 1: APPROVAL CONSUMPTION & EXECUTION FAILURE LIFECYCLE
    // =================================================================

    // 1.1 Create an approved ticket that will fail during handler execution
    const failTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Compliance:Reports",
        justification: "Audit test for handler failure recovery",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Execute with simulated failure
    const failRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Compliance:Reports",
        approvalId: failTicket.id,
        params: { _simulateFailure: true },
      }),
    });
    const failData = await failRes.json();
    const failTicketDb = await prisma.approvalRequest.findUnique({ where: { id: failTicket.id } });

    record(
      "SEC.1",
      "FAILURE LIFECYCLE",
      "Handler exception marks ticket FAILED (does NOT falsely report success or reset to APPROVED)",
      "HTTP 500, status='FAILED', ticket in DB marked 'FAILED'",
      `HTTP ${failRes.status}, responseStatus=${failData.status}, dbStatus=${failTicketDb?.status}`,
      failRes.status === 500 && failData.status === "FAILED" && failTicketDb?.status === "FAILED"
    );

    // 1.2 Verify audit log recorded the failure with executionId
    const failAudit = await prisma.auditLog.findFirst({
      where: {
        agentId: auditAgent.id,
        action: "AGENT_EXECUTION_FAILED",
      },
      orderBy: { timestamp: "desc" },
    });
    record(
      "SEC.2",
      "AUDIT TRAIL",
      "Handler failure creates AGENT_EXECUTION_FAILED audit log with executionId and ticket ID",
      "Audit log present, status='DENIED', details contain executionId and ticketId",
      `action=${failAudit?.action}, status=${failAudit?.status}, details='${failAudit?.details}'`,
      Boolean(failAudit && failAudit.status === "DENIED" && failAudit.details.includes(failTicket.id))
    );

    // 1.3 Verify that attempting to re-use the FAILED ticket is strictly blocked
    const reuseFailedRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Compliance:Reports",
        approvalId: failTicket.id,
      }),
    });
    const reuseFailedData = await reuseFailedRes.json();
    record(
      "SEC.3",
      "FAILURE REPLAY",
      "Re-executing with a FAILED approval ticket is prohibited (prevents duplicate side-effects)",
      "HTTP 403 Forbidden with failed prior attempt message",
      `HTTP ${reuseFailedRes.status}, error='${reuseFailedData.error}'`,
      reuseFailedRes.status === 403 && reuseFailedData.error?.includes("failed during prior execution attempt")
    );

    // =================================================================
    // SECTION 2: EXPIRED APPROVAL TICKET REJECTION
    // =================================================================
    const expiredTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Compliance:Reports",
        justification: "Audit test for expired approval ticket",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      },
    });

    const expiredRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Compliance:Reports",
        approvalId: expiredTicket.id,
      }),
    });
    const expiredData = await expiredRes.json();
    record(
      "SEC.4",
      "EXPIRATION ENFORCEMENT",
      "Expired approval ticket is rejected at runtime",
      "HTTP 403 Forbidden, error indicates expired ticket",
      `HTTP ${expiredRes.status}, error='${expiredData.error}'`,
      expiredRes.status === 403 && expiredData.error?.includes("expired")
    );

    // =================================================================
    // SECTION 3: AGENT SELF-APPROVAL PREVENTION
    // =================================================================
    const pendingTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Compliance:Reports",
        justification: "Ticket for self-approval prevention test",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Agent attempts to call human approval PATCH endpoint using agent Bearer token
    const selfApproveRes = await fetch(`${BASE}/api/approvals/${pendingTicket.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`, // Agent key, not human session
      },
      body: JSON.stringify({ decision: "APPROVED" }),
    });
    record(
      "SEC.5",
      "DUAL-CONTROL SEPARATION",
      "Agent cannot self-approve tickets (human supervisory session strictly required)",
      "HTTP 401 or 403 (unauthorized/forbidden)",
      `HTTP ${selfApproveRes.status}`,
      selfApproveRes.status === 401 || selfApproveRes.status === 403
    );

    // Verify ticket remains PENDING in database
    const selfApproveDb = await prisma.approvalRequest.findUnique({ where: { id: pendingTicket.id } });
    record(
      "SEC.6",
      "DUAL-CONTROL INTEGRITY",
      "Approval ticket status unmodified after agent self-approval attempt",
      "Ticket status remains 'PENDING'",
      `status='${selfApproveDb?.status}'`,
      selfApproveDb?.status === "PENDING"
    );

    // =================================================================
    // SECTION 4: CROSS-RESOURCE APPROVAL REUSE REJECTION
    // =================================================================
    const resourceTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Reports:SensitiveFinancial",
        justification: "Ticket specifically scoped to Reports:SensitiveFinancial",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Attempt to execute with mismatched resource
    const crossResourceRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Payroll:ExecutiveSalaries", // Mismatched resource!
        approvalId: resourceTicket.id,
      }),
    });
    const crossResourceData = await crossResourceRes.json();
    record(
      "SEC.7",
      "RESOURCE CONFINEMENT",
      "Cross-resource approval reuse is strictly prohibited",
      "HTTP 403 Forbidden with Cross-resource reuse prohibited error",
      `HTTP ${crossResourceRes.status}, error='${crossResourceData.error}'`,
      crossResourceRes.status === 403 && crossResourceData.error?.includes("Cross-resource reuse prohibited")
    );

    // =================================================================
    // SECTION 5: ATOMIC CONCURRENCY RACE CONDITION PREVENTION
    // =================================================================
    const raceTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Compliance:Reports",
        justification: "Ticket for concurrent race condition testing",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Fire 2 concurrent requests simultaneously with the same approval ticket
    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${BASE}/api/agent-runtime/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rawApiKey}`,
        },
        body: JSON.stringify({
          action: "generate_compliance_summary",
          resource: "Compliance:Reports",
          approvalId: raceTicket.id,
        }),
      }),
      fetch(`${BASE}/api/agent-runtime/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rawApiKey}`,
        },
        body: JSON.stringify({
          action: "generate_compliance_summary",
          resource: "Compliance:Reports",
          approvalId: raceTicket.id,
        }),
      }),
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort();
    const hasOneSuccess = statuses.includes(200);
    const hasOneBlocked = statuses.includes(403);

    record(
      "SEC.8",
      "ATOMIC LOCKING",
      "Concurrent execution race condition: Exactly 1 executes, 1 is atomically blocked",
      "One HTTP 200, One HTTP 403 (single-use dual control lock)",
      `Statuses: [${statuses.join(", ")}]`,
      hasOneSuccess && hasOneBlocked
    );

    // =================================================================
    // SECTION 6: SINGLE-USE CONSUMPTION: REPLAY AFTER SUCCESS
    // =================================================================
    const replayRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Compliance:Reports",
        approvalId: raceTicket.id,
      }),
    });
    const replayData = await replayRes.json();
    record(
      "SEC.9",
      "REPLAY PREVENTION",
      "Approval ticket cannot be replayed after successful execution",
      "HTTP 403 Forbidden with already been executed message",
      `HTTP ${replayRes.status}, error='${replayData.error}'`,
      replayRes.status === 403 && replayData.error?.includes("already been executed")
    );

    // =================================================================
    // SECTION 7: REVOKED CREDENTIALS AFTER APPROVAL
    // =================================================================
    const revokedTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Compliance:Reports",
        justification: "Ticket for revoked credential audit test",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Revoke agent
    await prisma.agent.update({ where: { id: auditAgent.id }, data: { status: "REVOKED" } });

    const revokedRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Compliance:Reports",
        approvalId: revokedTicket.id,
      }),
    });
    record(
      "SEC.10",
      "REVOCATION ENFORCEMENT",
      "Revoked agent cannot execute even with a previously approved ticket",
      "HTTP 403 Forbidden (REVOKED agent status)",
      `HTTP ${revokedRes.status}`,
      revokedRes.status === 403
    );

    // Reactivate agent for remaining tests
    await prisma.agent.update({ where: { id: auditAgent.id }, data: { status: "ACTIVE" } });

    // =================================================================
    // SECTION 8: SUSPENDED AGENT AFTER APPROVAL
    // =================================================================
    const suspendedTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "generate_compliance_summary",
        resource: "Compliance:Reports",
        justification: "Ticket for suspended agent audit test",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Suspend agent
    await prisma.agent.update({ where: { id: auditAgent.id }, data: { status: "SUSPENDED" } });

    const suspendedRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "generate_compliance_summary",
        resource: "Compliance:Reports",
        approvalId: suspendedTicket.id,
      }),
    });
    record(
      "SEC.11",
      "SUSPENSION ENFORCEMENT",
      "Suspended agent cannot execute even with an approved ticket",
      "HTTP 403 Forbidden (SUSPENDED status)",
      `HTTP ${suspendedRes.status}`,
      suspendedRes.status === 403
    );

    // Reactivate agent
    await prisma.agent.update({ where: { id: auditAgent.id }, data: { status: "ACTIVE" } });

    // =================================================================
    // SECTION 9: REJECTION OF UNKNOWN / UNREGISTERED ACTIONS
    // =================================================================
    const unknownRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "drop_all_database_tables",
      }),
    });
    record(
      "SEC.12",
      "REGISTRY BOUNDARY",
      "Arbitrary or unregistered action rejected before policy evaluation",
      "HTTP 400 Bad Request",
      `HTTP ${unknownRes.status}`,
      unknownRes.status === 400
    );

    // =================================================================
    // SECTION 10: CRITICAL ROLE MODIFICATION SAFELY BLOCKED
    // =================================================================
    const roleTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: auditAgent.id,
        requesterName: auditAgent.name,
        targetAction: "roles.manage",
        resource: "Security:Roles",
        justification: "Audit test for critical role modification block",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const blockRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: JSON.stringify({
        action: "modify_system_roles",
        resource: "Security:Roles",
        approvalId: roleTicket.id,
      }),
    });
    const blockData = await blockRes.json();
    const blockAudit = await prisma.auditLog.findFirst({
      where: {
        agentId: auditAgent.id,
        action: "AGENT_EXECUTION_BLOCKED",
      },
      orderBy: { timestamp: "desc" },
    });

    record(
      "SEC.13",
      "CRITICAL ACTION PROTECTION",
      "modify_system_roles returns status='BLOCKED' and logs AGENT_EXECUTION_BLOCKED",
      "HTTP 200, status='BLOCKED', AGENT_EXECUTION_BLOCKED audit recorded",
      `HTTP ${blockRes.status}, status=${blockData.status}, auditAction=${blockAudit?.action}`,
      blockRes.status === 200 && blockData.status === "BLOCKED" && blockAudit?.action === "AGENT_EXECUTION_BLOCKED"
    );

    // =================================================================
    // SECTION 11: FORENSIC AUDIT TRAIL FIELD COMPLETENESS
    // =================================================================
    const allAgentAudits = await prisma.auditLog.findMany({
      where: { agentId: auditAgent.id },
      orderBy: { timestamp: "desc" },
    });

    // Check that every audit log has non-null timestamp, action, actorType, status, and details containing executionId or agent name
    const allValid = allAgentAudits.length >= 5 && allAgentAudits.every((log) => {
      return (
        log.actorType === "AGENT" &&
        Boolean(log.action) &&
        Boolean(log.status) &&
        Boolean(log.details) &&
        Boolean(log.timestamp)
      );
    });

    record(
      "SEC.14",
      "AUDIT RECORD COMPLETENESS",
      "All execution lifecycle events contain actorType, action, status, details, and timestamp",
      "All logs valid and non-empty (>5 events recorded)",
      `Total logs: ${allAgentAudits.length}, allValid: ${allValid}`,
      allValid
    );

  } finally {
    // Clean up test fixtures safely
    await prisma.delegation.deleteMany({ where: { agentId: auditAgent.id } }).catch(() => {});
    await prisma.approvalRequest.deleteMany({ where: { requesterId: auditAgent.id } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { agentId: auditAgent.id } }).catch(() => {});
    await prisma.agent.delete({ where: { id: auditAgent.id } }).catch(() => {});
  }

  // Summary
  console.log("-------------------------------------------------------------");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`TOTAL AUDIT TESTS: ${results.length}`);
  console.log(`PASSED:            ${passed}`);
  console.log(`FAILED:            ${failed}`);
  console.log("-------------------------------------------------------------");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  });
