import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3040";

async function run() {
  console.log("🔒 =============================================================");
  console.log("🔒   SECUREID - COMPLETE AGENTIC RUNTIME AUTHORIZATION SUITE    ");
  console.log("🔒   Verifying Steps 3.3, 3.4, 3.5, 3.6, and 3.7                ");
  console.log("🔒 =============================================================\n");

  const results: { id: string; category: string; title: string; expected: string; actual: string; pass: boolean }[] = [];

  function record(id: string, category: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, category, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] (${category}) ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // Baseline setup
  const agentRole = await prisma.role.findUnique({
    where: { name: "AI Agent" },
    include: { permissions: { include: { permission: true } } },
  });
  if (!agentRole) throw new Error("AI Agent role not found");

  const adminUser = await prisma.user.findFirst({
    where: { role: { name: "Admin" } },
  });
  if (!adminUser) throw new Error("Admin user not found");

  // Primary test agent
  const rawKey1 = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash1 = await bcrypt.hash(rawKey1, 10);
  const agent1 = await prisma.agent.create({
    data: {
      name: `Lifecycle-Agent-1-${Date.now()}`,
      description: "Ephemeral agent for complete lifecycle testing",
      apiKeyHash: apiKeyHash1,
      status: "ACTIVE",
      rateLimit: 120,
      roleId: agentRole.id,
    },
  });

  // Secondary test agent (for cross-agent reuse checks)
  const rawKey2 = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash2 = await bcrypt.hash(rawKey2, 10);
  const agent2 = await prisma.agent.create({
    data: {
      name: `Lifecycle-Agent-2-${Date.now()}`,
      description: "Secondary agent for cross-agent reuse testing",
      apiKeyHash: apiKeyHash2,
      status: "ACTIVE",
      rateLimit: 120,
      roleId: agentRole.id,
    },
  });

  try {
    // =================================================================
    // CATEGORY A: AUTHENTICATION TESTS
    // =================================================================
    // A.1 Valid Credentials
    const a1Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    const a1Data = await a1Res.json();
    record("A.1", "AUTH", "Valid agent Bearer credential authenticates", "HTTP 200, success=true", `HTTP ${a1Res.status}, success=${a1Data.success}`, a1Res.status === 200 && a1Data.success === true);

    // A.2 Invalid Credentials
    const a2Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sec_agent_000000000000000000000000000000000000000000000000",
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    record("A.2", "AUTH", "Unregistered credentials rejected", "HTTP 401 Unauthorized", `HTTP ${a2Res.status}`, a2Res.status === 401);

    // A.3 Suspended Agent
    await prisma.agent.update({ where: { id: agent1.id }, data: { status: "SUSPENDED" } });
    const a3Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    record("A.3", "AUTH", "Suspended agent blocked from execution", "HTTP 403 Forbidden", `HTTP ${a3Res.status}`, a3Res.status === 403);
    await prisma.agent.update({ where: { id: agent1.id }, data: { status: "ACTIVE" } });

    // =================================================================
    // CATEGORY B: AUTHORIZATION & REGISTRY TESTS
    // =================================================================
    // B.1 Unknown Action
    const b1Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({ action: "unknown_hack_command" }),
    });
    const b1Data = await b1Res.json();
    record("B.1", "AUTHZ", "Unknown action rejected with HTTP 400", "HTTP 400 Bad Request", `HTTP ${b1Res.status}, status=${b1Data.status}`, b1Res.status === 400 && b1Data.status === "FAILED");

    // B.2 Permission Tampering
    const b2Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        permission: "reports.read", // Agent tries to bypass users.read with standing reports.read!
      }),
    });
    const b2Data = await b2Res.json();
    record("B.2", "AUTHZ", "Client permission tampering rejected (Registry enforces users.read)", "HTTP 403 Forbidden, requiredPermission=users.read", `HTTP ${b2Res.status}, requiredPermission=${b2Data.requiredPermission}`, b2Res.status === 403 && b2Data.requiredPermission === "users.read");

    // B.3 Scoped Delegation Validation
    const delegation = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: agent1.id,
        permissions: JSON.stringify(["users.read"]),
        scope: "Finance User Directory",
        reason: "Scoped directory read delegation",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // In-scope
    const b3InScope = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Finance User Directory",
      }),
    });
    const b3InData = await b3InScope.json();
    record("B.3", "AUTHZ", "In-scope delegated action succeeds", "HTTP 200 OK, delegation used", `HTTP ${b3InScope.status}, delegationId=${b3InData.delegationDetails?.delegationId}`, b3InScope.status === 200 && b3InData.delegationDetails?.delegationId === delegation.id);

    // Out-of-scope
    const b4OutOfScope = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Engineering Payroll",
      }),
    });
    const b4OutData = await b4OutOfScope.json();
    record("B.4", "AUTHZ", "Out-of-scope delegated action rejected", "HTTP 403 Forbidden, reason='SCOPE_MISMATCH'", `HTTP ${b4OutOfScope.status}, reason=${b4OutData.reason}`, b4OutOfScope.status === 403 && b4OutData.reason === "SCOPE_MISMATCH");

    // Expired delegation
    await prisma.delegation.update({ where: { id: delegation.id }, data: { expiresAt: new Date(Date.now() - 3600 * 1000) } });
    const b5Expired = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Finance User Directory",
      }),
    });
    record("B.5", "AUTHZ", "Expired delegation rejected", "HTTP 403 Forbidden", `HTTP ${b5Expired.status}`, b5Expired.status === 403);
    await prisma.delegation.delete({ where: { id: delegation.id } });

    // =================================================================
    // CATEGORY C: APPROVAL-TO-EXECUTION LINKAGE & SINGLE-USE CONSUMPTION
    // =================================================================
    // C.1 Create high-risk delegation for modify_system_roles
    const roleDelegation = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: agent1.id,
        permissions: JSON.stringify(["roles.manage"]),
        scope: "Security:Roles",
        reason: "Test sensitive action approval lifecycle",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // C.2 First invocation without approval ticket -> APPROVAL_REQUIRED
    const c1Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({ action: "modify_system_roles" }),
    });
    const c1Data = await c1Res.json();
    const generatedTicketId = c1Data.approvalId;
    record("C.1", "APPROVAL", "Sensitive action creates approval ticket & blocks execution", "HTTP 403, status='APPROVAL_REQUIRED', ticketId present", `HTTP ${c1Res.status}, status=${c1Data.status}, ticketId=${generatedTicketId}`, c1Res.status === 403 && c1Data.status === "APPROVAL_REQUIRED" && Boolean(generatedTicketId));

    // C.3 Pending ticket blocks execution if retried
    const c2Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({ action: "modify_system_roles" }),
    });
    const c2Data = await c2Res.json();
    record("C.2", "APPROVAL", "Pending ticket continues to block execution safely", "HTTP 403, status='APPROVAL_REQUIRED', same ticketId reused", `HTTP ${c2Res.status}, status=${c2Data.status}, reusesId=${c2Data.approvalId === generatedTicketId}`, c2Res.status === 403 && c2Data.approvalId === generatedTicketId);

    // C.4 Approve the ticket by supervisor
    await prisma.approvalRequest.update({
      where: { id: generatedTicketId },
      data: {
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
      },
    });

    // C.5 Cross-Action Mismatch: Attempting to use the approval for another action (e.g. read_agent_telemetry)
    const c5Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "read_agent_telemetry",
        approvalId: generatedTicketId, // Mismatched action!
      }),
    });
    const c5Data = await c5Res.json();
    record("C.5", "APPROVAL", "Approval ticket cannot be reused for a different action", "HTTP 403 Forbidden with action mismatch error", `HTTP ${c5Res.status}, error='${c5Data.error}'`, c5Res.status === 403 && c5Data.error?.includes("Cross-action reuse prohibited"));

    // C.6 Cross-Agent Mismatch: Agent 2 attempting to use Agent 1's approved ticket
    const roleDelegation2 = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: agent2.id,
        permissions: JSON.stringify(["roles.manage"]),
        scope: "Security:Roles",
        reason: "Agent 2 delegated roles.manage",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const c6Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey2}`, // Agent 2 token!
      },
      body: JSON.stringify({
        action: "modify_system_roles",
        approvalId: generatedTicketId,
      }),
    });
    const c6Data = await c6Res.json();
    record("C.6", "APPROVAL", "Approval ticket cannot be hijacked by another agent", "HTTP 403 Forbidden with identity mismatch error", `HTTP ${c6Res.status}, error='${c6Data.error}'`, c6Res.status === 403 && c6Data.error?.includes("Cross-agent reuse prohibited"));
    await prisma.delegation.delete({ where: { id: roleDelegation2.id } });

    // C.7 Valid execution with approved ticket succeeds (Action returns BLOCKED by enterprise policy, but authorization succeeds!)
    const c7Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "modify_system_roles",
      }),
    });
    const c7Data = await c7Res.json();
    const ticketAfterExec = await prisma.approvalRequest.findUnique({ where: { id: generatedTicketId } });
    record("C.7", "APPROVAL", "Approved action executes and ticket transitions to EXECUTED", "HTTP 200, status in DB is 'EXECUTED'", `HTTP ${c7Res.status}, dbStatus=${ticketAfterExec?.status}`, c7Res.status === 200 && ticketAfterExec?.status === "EXECUTED");

    // C.8 Single-Use Consumption: Duplicate execution attempt with consumed ticket MUST be rejected
    const c8Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({
        action: "modify_system_roles",
        approvalId: generatedTicketId,
      }),
    });
    const c8Data = await c8Res.json();
    record("C.8", "APPROVAL", "Single-use dual control: Consumed ticket cannot be executed again", "HTTP 403 Forbidden (already executed)", `HTTP ${c8Res.status}, error='${c8Data.error}'`, c8Res.status === 403 && c8Data.error?.includes("already been executed"));

    // Cleanup role delegation and ticket
    await prisma.delegation.delete({ where: { id: roleDelegation.id } });
    await prisma.approvalRequest.delete({ where: { id: generatedTicketId } });

    // =================================================================
    // CATEGORY D: STANDARDIZED ENVELOPE & REAL HANDLERS
    // =================================================================
    // D.1 Standardized Response Structure
    const d1Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    const d1Data = await d1Res.json();
    const hasEnvelope =
      typeof d1Data.success === "boolean" &&
      typeof d1Data.status === "string" &&
      typeof d1Data.action === "string" &&
      typeof d1Data.executionId === "string" &&
      d1Data.executionId.startsWith("exec_") &&
      typeof d1Data.data === "object" &&
      typeof d1Data.message === "string";
    record("D.1", "ENVELOPE", "Execution returns standardized response envelope", "All keys: success, status, action, executionId, data, message present", `success=${d1Data.success}, status=${d1Data.status}, execId=${d1Data.executionId}`, hasEnvelope && d1Data.status === "SUCCESS");

    // D.2 Audit trail contains execution events
    const auditEvents = await prisma.auditLog.findMany({
      where: {
        actorId: agent1.id,
      },
      orderBy: { timestamp: "desc" },
      take: 10,
    });
    const hasStartedEvent = auditEvents.some((e) => e.action === "AGENT_EXECUTION_STARTED");
    const hasCompletedEvent = auditEvents.some((e) => e.action === "AGENT_EXECUTION_COMPLETED");
    const hasExecutionIdInDetails = auditEvents.some((e) => e.details?.includes("ExecutionId: [exec_"));
    record("D.2", "AUDIT", "Audit trail records AGENT_EXECUTION_STARTED and COMPLETED with ExecutionId", "Started, Completed, and ExecutionId all present in DB", `started=${hasStartedEvent}, completed=${hasCompletedEvent}, execIdLogged=${hasExecutionIdInDetails}`, hasStartedEvent && hasCompletedEvent && hasExecutionIdInDetails);

    // =================================================================
    // CATEGORY E: SECURITY HARDENING
    // =================================================================
    // E.1 Malformed JSON payload
    const e1Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: "INVALID_MALFORMED_JSON_STRING",
    });
    const e1Data = await e1Res.json();
    record("E.1", "HARDENING", "Malformed JSON payload rejected safely with HTTP 400", "HTTP 400 Bad Request", `HTTP ${e1Res.status}, status=${e1Data.status}`, e1Res.status === 400 && e1Data.status === "FAILED");

    // E.2 Payload Too Large (>100KB)
    const largePayload = JSON.stringify({
      action: "read_agent_telemetry",
      bloat: "X".repeat(110000), // >100KB
    });
    const e2Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey1}`,
      },
      body: largePayload,
    });
    record("E.2", "HARDENING", "Oversized payload (>100KB) rejected with HTTP 413", "HTTP 413 Payload Too Large", `HTTP ${e2Res.status}`, e2Res.status === 413);

  } finally {
    // Cleanup agents
    await prisma.agent.delete({ where: { id: agent1.id } });
    await prisma.agent.delete({ where: { id: agent2.id } });
    await prisma.$disconnect();
  }

  console.log("=============================================================");
  const passed = results.filter((r) => r.pass).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${results.length - passed}`);
  console.log(`OVERALL STATUS: ${passed === results.length ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);
  console.log("=============================================================");

  if (passed !== results.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
