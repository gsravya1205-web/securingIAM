import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3040";

async function run() {
  console.log("⚡ =============================================================");
  console.log("⚡   SECUREID - STEP 3.2: REAL AGENT ACTION HANDLERS TEST       ");
  console.log("⚡ =============================================================\n");

  const results: { id: string; title: string; expected: string; actual: string; pass: boolean }[] = [];

  function record(id: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // 1. Setup Test Agents
  // Role "AI Agent" has: reports.read, reports.create, agents.read
  const agentRole = await prisma.role.findUnique({
    where: { name: "AI Agent" },
    include: { permissions: { include: { permission: true } } },
  });
  if (!agentRole) throw new Error("AI Agent role not found");

  const rawKey = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(rawKey, 10);

  const testAgent = await prisma.agent.create({
    data: {
      name: `Step32-Agent-${Date.now()}`,
      description: "Ephemeral agent for Step 3.2 real handler verification",
      apiKeyHash,
      status: "ACTIVE",
      rateLimit: 120,
      roleId: agentRole.id,
    },
  });

  // Admin user for delegation
  const adminUser = await prisma.user.findFirst({
    where: { role: { name: "Admin" } },
  });
  if (!adminUser) throw new Error("Admin user not found");

  try {
    // -----------------------------------------------------------------
    // Test 1: Real Agent Telemetry (read_agent_telemetry)
    // -----------------------------------------------------------------
    const res1 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ action: "read_agent_telemetry" }),
    });
    const data1 = await res1.json();
    const hasAgentIdentity = data1.output?.agentIdentity?.id === testAgent.id;
    const hasRegistrySummary = typeof data1.output?.registrySummary?.totalRegisteredAgents === "number";
    const noSecretExposed = !JSON.stringify(data1).includes("apiKeyHash") && !JSON.stringify(data1).includes("$2a$");

    record(
      "3.2-1",
      "read_agent_telemetry returns live database telemetry & excludes secrets",
      "HTTP 200, agentIdentity matches DB, registrySummary present, zero apiKeyHash exposed",
      `HTTP ${res1.status}, idMatch=${hasAgentIdentity}, totalAgents=${data1.output?.registrySummary?.totalRegisteredAgents}, secretsProtected=${noSecretExposed}`,
      res1.status === 200 && data1.success === true && hasAgentIdentity && hasRegistrySummary && noSecretExposed
    );

    // -----------------------------------------------------------------
    // Test 2: Real Compliance Summary (generate_compliance_summary)
    // -----------------------------------------------------------------
    const res2 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ action: "generate_compliance_summary" }),
    });
    const data2 = await res2.json();
    const metrics = data2.output?.metrics;
    const isCalculatedRate = typeof metrics?.authorizationSuccessRatePercent === "number";
    const hasRealCounts = typeof metrics?.totalAuditEvents === "number" && metrics.totalAuditEvents > 0;
    const noFabricatedScore = data2.output?.summary !== undefined && !data2.output?.summary.includes("98.4%");

    record(
      "3.2-2",
      "generate_compliance_summary calculates real metrics from live audit ledger",
      "HTTP 200, calculated success rate, real audit events > 0, unhardcoded summary",
      `HTTP ${res2.status}, events=${metrics?.totalAuditEvents}, successRate=${metrics?.authorizationSuccessRatePercent}%, realSummary=${noFabricatedScore}`,
      res2.status === 200 && isCalculatedRate && hasRealCounts && noFabricatedScore
    );

    // -----------------------------------------------------------------
    // Test 3: Unauthorized query_user_directory is blocked (RBAC / PDP)
    // -----------------------------------------------------------------
    const res3 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ action: "query_user_directory" }),
    });
    record(
      "3.2-3",
      "Unauthorized agent blocked from querying user directory (RBAC enforcement)",
      "HTTP 403 Forbidden",
      `HTTP ${res3.status}`,
      res3.status === 403
    );

    // -----------------------------------------------------------------
    // Test 4: Real query_user_directory via Scoped Delegation
    // -----------------------------------------------------------------
    const delegation = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: testAgent.id,
        permissions: JSON.stringify(["users.read"]),
        scope: "Users:Directory",
        reason: "Authorized audit delegation for Step 3.2 verification",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const res4 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Users:Directory",
        limit: 5,
      }),
    });
    const data4 = await res4.json();
    const usersList = data4.output?.users;
    const hasUsers = Array.isArray(usersList) && usersList.length > 0;
    const paginationOk = data4.output?.pagination?.total > 0 && data4.output?.pagination?.limit === 5;
    
    // Crucial check: passwordHash and sensitive fields must NEVER be returned!
    const jsonDump = JSON.stringify(data4);
    const passwordLeak = jsonDump.includes("passwordHash") || jsonDump.includes("password") || jsonDump.includes("$2a$");

    record(
      "3.2-4",
      "Authorized query_user_directory returns real records with pagination & NO credentials leak",
      "HTTP 200, users list populated, pagination limit 5, zero password leaks",
      `HTTP ${res4.status}, usersFound=${usersList?.length}, totalInDb=${data4.output?.pagination?.total}, passwordLeak=${passwordLeak}`,
      res4.status === 200 && hasUsers && paginationOk && !passwordLeak
    );

    // -----------------------------------------------------------------
    // Test 5: Protected Operation modify_system_roles remains blocked
    // -----------------------------------------------------------------
    // Even if an agent were granted roles.manage, the handler must return status BLOCKED / supported: false
    const roleDelegation = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: testAgent.id,
        permissions: JSON.stringify(["roles.manage"]),
        scope: "Security:Roles",
        reason: "Test attempt to execute modify_system_roles",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Also pre-create an approved approval ticket so PDP allows it through to handler
    const approvalTicket = await prisma.approvalRequest.create({
      data: {
        requesterType: "AGENT",
        requesterId: testAgent.id,
        requesterName: testAgent.name,
        targetAction: "roles.manage",
        resource: "Security:Roles",
        justification: "Test approved signoff for role modify check",
        status: "APPROVED",
        reviewerId: adminUser.id,
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const res5 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "modify_system_roles",
      }),
    });
    const data5 = await res5.json();
    const isOperationBlocked = data5.output?.status === "BLOCKED" && data5.output?.supported === false;

    record(
      "3.2-5",
      "modify_system_roles remains BLOCKED with explicit unsupported notification",
      "HTTP 200, output.status='BLOCKED', output.supported=false (no DB changes executed)",
      `HTTP ${res5.status}, status=${data5.output?.status}, supported=${data5.output?.supported}`,
      res5.status === 200 && isOperationBlocked
    );

    // Clean up delegations and approval ticket
    await prisma.delegation.delete({ where: { id: delegation.id } });
    await prisma.delegation.delete({ where: { id: roleDelegation.id } });
    await prisma.approvalRequest.delete({ where: { id: approvalTicket.id } });

  } finally {
    await prisma.agent.delete({ where: { id: testAgent.id } });
    await prisma.$disconnect();
  }

  console.log("=============================================================");
  const passed = results.filter((r) => r.pass).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${results.length - passed}`);
  console.log(`OVERALL STEP 3.2 STATUS: ${passed === results.length ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);
  console.log("=============================================================");

  if (passed !== results.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

