import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3040";

async function run() {
  console.log("🛡️ =============================================================");
  console.log("🛡️   SECUREID - STEP 1: AGENT RUNTIME GATEWAY PDP INTEGRATION   ");
  console.log("🛡️ =============================================================\n");

  const results: { id: string; title: string; expected: string; actual: string; pass: boolean }[] = [];

  function record(id: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // 1. Setup Test Agent with "AI Agent" role (which has reports.read, reports.create, agents.read)
  const role = await prisma.role.findUnique({
    where: { name: "AI Agent" },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) throw new Error("AI Agent role not found");

  const rawKey = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(rawKey, 10);

  const testAgent = await prisma.agent.create({
    data: {
      name: `Gateway-Test-Agent-${Date.now()}`,
      description: "Ephemeral agent for gateway integration tests",
      apiKeyHash,
      status: "ACTIVE",
      rateLimit: 120,
      roleId: role.id,
    },
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Valid agent with permission -> ALLOW
    // -------------------------------------------------------------
    const test1Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "read_agent_telemetry", // maps to agents.read on Agents:Telemetry
      }),
    });
    const test1Data = await test1Res.json();
    record(
      "1",
      "Valid agent with standing permission -> ALLOW",
      "HTTP 200, success=true",
      `HTTP ${test1Res.status}, success=${test1Data.success}`,
      test1Res.status === 200 && test1Data.success === true
    );

    // -------------------------------------------------------------
    // Test 2: Valid agent without permission -> DENY
    // -------------------------------------------------------------
    // "AI Agent" role does NOT possess "users.read"
    const test2Res = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "query_user_directory", // maps to users.read on Users:Directory
      }),
    });
    const test2Data = await test2Res.json();
    record(
      "2",
      "Valid agent without permission -> DENY",
      "HTTP 403, verdict='DENY'",
      `HTTP ${test2Res.status}, verdict=${test2Data.verdict || test2Data.decision}`,
      test2Res.status === 403 && (test2Data.verdict === "DENY" || test2Data.decision === "DENY")
    );

    // -------------------------------------------------------------
    // Test 3: Expired or revoked agent credential -> DENY
    // -------------------------------------------------------------
    // 3A: Completely invalid/revoked token
    const invalidTokenRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sec_agent_000000000000000000000000000000000000000000000000",
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    record(
      "3A",
      "Invalid or unregistered machine token -> DENY (401)",
      "HTTP 401 Unauthorized",
      `HTTP ${invalidTokenRes.status}`,
      invalidTokenRes.status === 401
    );

    // 3B: Suspended / Revoked agent identity
    await prisma.agent.update({
      where: { id: testAgent.id },
      data: { status: "SUSPENDED" },
    });
    const suspendedRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    record(
      "3B",
      "Suspended/Revoked agent credential -> DENY (403)",
      "HTTP 403 Forbidden",
      `HTTP ${suspendedRes.status}`,
      suspendedRes.status === 403
    );
    // Restore status to ACTIVE
    await prisma.agent.update({
      where: { id: testAgent.id },
      data: { status: "ACTIVE" },
    });

    // -------------------------------------------------------------
    // Test 4: Agent with invalid delegation scope -> DENY
    // -------------------------------------------------------------
    // Create an Admin user to grant delegation
    const adminUser = await prisma.user.findFirst({
      where: { role: { name: "Admin" } },
    });
    if (!adminUser) throw new Error("Admin user not found");

    // Grant delegation for "users.read" strictly scoped to "Sales Directory"
    const scopedDelegation = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: testAgent.id,
        permissions: JSON.stringify(["users.read"]),
        scope: "Sales Directory",
        reason: "Test scoped delegation for Sales only",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // 4A: In-scope access to "Sales Directory" -> ALLOW
    const inScopeRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Sales Directory",
      }),
    });
    const inScopeData = await inScopeRes.json();
    record(
      "4A",
      "In-scope delegated action -> ALLOW",
      "HTTP 200, delegation used",
      `HTTP ${inScopeRes.status}, delegationId=${inScopeData.delegationDetails?.delegationId}`,
      inScopeRes.status === 200 && inScopeData.delegationDetails?.delegationId === scopedDelegation.id
    );

    // 4B: Out-of-scope access to "Executive Payroll" -> DENY
    const outOfScopeRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Executive Payroll",
      }),
    });
    const outOfScopeData = await outOfScopeRes.json();
    record(
      "4B",
      "Agent with invalid delegation scope -> DENY",
      "HTTP 403, reason='SCOPE_MISMATCH'",
      `HTTP ${outOfScopeRes.status}, reason=${outOfScopeData.reason}`,
      outOfScopeRes.status === 403 && outOfScopeData.reason === "SCOPE_MISMATCH"
    );

    // Clean up delegation
    await prisma.delegation.delete({ where: { id: scopedDelegation.id } });

    // -------------------------------------------------------------
    // Test 5: Sensitive action / resource -> APPROVAL_REQUIRED
    // -------------------------------------------------------------
    // Agent requests access to high-risk resource "Reports:SensitiveFinancial"
    // Agent possesses "reports.create" standing permission, but resource requires human approval!
    const sensitiveRes = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: {
        Authorization: `Bearer ${rawKey}`,
      },
    });
    const sensitiveData = await sensitiveRes.json();
    record(
      "5",
      "Sensitive action / high-risk resource -> APPROVAL_REQUIRED",
      "HTTP 403, verdict='APPROVAL_REQUIRED'",
      `HTTP ${sensitiveRes.status}, verdict=${sensitiveData.verdict}`,
      sensitiveRes.status === 403 && sensitiveData.verdict === "APPROVAL_REQUIRED"
    );

    // Also test sensitive action "roles.manage" via runtime execute
    const sensitiveActionRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "modify_system_roles",
      }),
    });
    const sensitiveActionData = await sensitiveActionRes.json();
    record(
      "5B",
      "High-risk action (modify_system_roles) without permission -> DENY",
      "HTTP 403 Forbidden",
      `HTTP ${sensitiveActionRes.status}, verdict=${sensitiveActionData.verdict || sensitiveActionData.decision}`,
      sensitiveActionRes.status === 403
    );

  } finally {
    // Clean up test agent
    await prisma.agent.delete({ where: { id: testAgent.id } }).catch(() => {});
  }

  console.log("=============================================================");
  console.log("               TEST SUITE EXECUTION SUMMARY                  ");
  console.log("=============================================================");
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`Total Tests Executed: ${total}`);
  console.log(`Passed:               ${passed}`);
  console.log(`Failed:               ${failed}`);
  console.log("=============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
}).finally(() => prisma.$disconnect());

