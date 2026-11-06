import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3040";

async function run() {
  console.log("🧩 =============================================================");
  console.log("🧩   SECUREID - STEP 3.1: CENTRALIZED AGENT ACTION REGISTRY     ");
  console.log("🧩 =============================================================\n");

  const results: { id: string; title: string; expected: string; actual: string; pass: boolean }[] = [];

  function record(id: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // 1. Setup Test Agent with "AI Agent" role
  const role = await prisma.role.findUnique({
    where: { name: "AI Agent" },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) throw new Error("AI Agent role not found in database");

  const rawKey = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(rawKey, 10);

  const testAgent = await prisma.agent.create({
    data: {
      name: `Step3-Agent-${Date.now()}`,
      description: "Ephemeral agent for Step 3.1 action registry tests",
      apiKeyHash,
      status: "ACTIVE",
      rateLimit: 120,
      roleId: role.id,
    },
  });

  try {
    // -----------------------------------------------------------------
    // Test 1: Registered Action (read_agent_telemetry) Executes Successfully
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
    record(
      "3.1-1",
      "Registered action (read_agent_telemetry) resolves and executes",
      "HTTP 200, success=true, output.registeredAgentsCount present",
      `HTTP ${res1.status}, success=${data1.success}, count=${data1.output?.registeredAgentsCount}`,
      res1.status === 200 && data1.success === true && typeof data1.output?.registeredAgentsCount === "number"
    );

    // -----------------------------------------------------------------
    // Test 2: Registered Action (generate_compliance_summary) Executes Successfully
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
    record(
      "3.1-2",
      "Registered action (generate_compliance_summary) resolves and executes",
      "HTTP 200, riskClassification='HIGH', complianceScore present",
      `HTTP ${res2.status}, risk=${data2.riskClassification}, score=${data2.output?.complianceScore}`,
      res2.status === 200 && data2.success === true && data2.riskClassification === "HIGH"
    );

    // -----------------------------------------------------------------
    // Test 3: Unknown Action is Rejected with HTTP 400 (Generic fallback removed)
    // -----------------------------------------------------------------
    const res3 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ action: "unregistered_external_action" }),
    });
    const data3 = await res3.json();
    record(
      "3.1-3",
      "Unknown action is rejected with HTTP 400 (Generic fallback removed)",
      "HTTP 400 Bad Request with error message listing registered actions",
      `HTTP ${res3.status}, error='${data3.error}'`,
      res3.status === 400 && data3.error?.includes("unregistered_external_action") && Array.isArray(data3.registeredActions)
    );

    // -----------------------------------------------------------------
    // Test 4: Missing Action is Rejected with HTTP 400
    // -----------------------------------------------------------------
    const res4 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({}),
    });
    const data4 = await res4.json();
    record(
      "3.1-4",
      "Missing action field is rejected with HTTP 400",
      "HTTP 400 Bad Request",
      `HTTP ${res4.status}, error='${data4.error}'`,
      res4.status === 400 && data4.error?.includes("Missing required 'action'")
    );

    // -----------------------------------------------------------------
    // Test 5: Client Cannot Tamper with Required Permission
    // Agent attempts to downgrade required permission from users.read to reports.read
    // -----------------------------------------------------------------
    const res5 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        permission: "reports.read", // Spoofed attempt! Registry requires "users.read"
      }),
    });
    const data5 = await res5.json();
    record(
      "3.1-5",
      "Client cannot tamper with permission (Registry enforces users.read)",
      "HTTP 403 Forbidden, requiredPermission='users.read'",
      `HTTP ${res5.status}, requiredPermission=${data5.requiredPermission}`,
      res5.status === 403 && data5.requiredPermission === "users.read"
    );

    // -----------------------------------------------------------------
    // Test 6: Scoped Delegation with Registered Action
    // -----------------------------------------------------------------
    const adminUser = await prisma.user.findFirst({
      where: { role: { name: "Admin" } },
    });
    if (!adminUser) throw new Error("Admin user not found");

    const delegation = await prisma.delegation.create({
      data: {
        grantorId: adminUser.id,
        agentId: testAgent.id,
        permissions: JSON.stringify(["users.read"]),
        scope: "Regional Sales Directory",
        reason: "Test registry execution under scoped delegation",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const res6 = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({
        action: "query_user_directory",
        resource: "Regional Sales Directory",
      }),
    });
    const data6 = await res6.json();
    record(
      "3.1-6",
      "Registered action succeeds with valid scoped delegation",
      "HTTP 200 OK, delegation used",
      `HTTP ${res6.status}, delegationId=${data6.delegationDetails?.delegationId}`,
      res6.status === 200 && data6.delegationDetails?.delegationId === delegation.id
    );

    // Cleanup delegation
    await prisma.delegation.delete({ where: { id: delegation.id } });

  } finally {
    // Cleanup test agent
    await prisma.agent.delete({ where: { id: testAgent.id } });
    await prisma.$disconnect();
  }

  console.log("=============================================================");
  const passed = results.filter((r) => r.pass).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${results.length - passed}`);
  console.log(`OVERALL STEP 3.1 STATUS: ${passed === results.length ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);
  console.log("=============================================================");

  if (passed !== results.length) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

