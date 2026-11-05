import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3040";

interface TestResult {
  id: string;
  title: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const results: TestResult[] = [];

function record(id: string, title: string, expected: string, actual: string, pass: boolean) {
  results.push({ id, title, expected, actual, pass });
  const mark = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`[Test ${id}] ${title}`);
  console.log(`   Expected: ${expected}`);
  console.log(`   Actual:   ${actual}`);
  console.log(`   Status:   ${mark}\n`);
}

async function loginUser(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} with status ${res.status}: ${text}`);
  }
  const cookie = res.headers.get("set-cookie") || (res.headers as any).getSetCookie?.()?.[0];
  if (!cookie) throw new Error(`No cookie for ${email}`);
  return cookie.split(";")[0];
}

async function run() {
  console.log("🛡️ =============================================================");
  console.log("🛡️   SECUREID - PHASE 5: CENTRALIZED POLICY ENGINE TEST SUITE    ");
  console.log("🛡️ =============================================================\n");

  // 1. Authenticate users
  const adminCookie = await loginUser("admin@secureid.local", "admin123");
  const employeeCookie = await loginUser("employee@secureid.local", "employee123");

  const adminUser = await prisma.user.findUnique({ where: { email: "admin@secureid.local" } });
  const employeeUser = await prisma.user.findUnique({ where: { email: "employee@secureid.local" } });
  const employeeRole = await prisma.role.findUnique({ where: { name: "Employee" } });

  const ts = Date.now();
  const crypto = await import("crypto");
  const rawKeyA = `sec_pdp_${ts}_a`;
  const rawKeyB = `sec_pdp_${ts}_b`;

  // Create an active test agent
  const testAgent = await prisma.agent.create({
    data: {
      name: `PDPAgent-${ts}`,
      description: "Agent for testing centralized policy decisions",
      apiKeyHash: crypto.createHash("sha256").update(rawKeyA).digest("hex"),
      status: "ACTIVE",
      roleId: employeeRole!.id, // has reports.read
    },
  });

  // Create a suspended test agent
  const suspendedAgent = await prisma.agent.create({
    data: {
      name: `SuspendedAgent-${ts}`,
      description: "Agent to test suspension policy rule",
      apiKeyHash: crypto.createHash("sha256").update(rawKeyB).digest("hex"),
      status: "SUSPENDED",
      roleId: employeeRole!.id,
    },
  });

  // -------------------------------------------------------------
  // TEST 1: Unauthenticated GET /api/access-control/evaluate (401)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`);
    record("1", "Unauthenticated GET /api/access-control/evaluate rejected", "401", `${res.status}`, res.status === 401);
  } catch (err: any) {
    record("1", "Unauthenticated GET rejected", "401", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 2: Authenticated GET loads real identities and resources (200)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();
    const pass = res.status === 200 && data.identities?.length >= 2 && data.resources?.length >= 5;
    record(
      "2",
      "Authenticated GET returns real database identities and enterprise resources",
      "status=200, identities >= 2, resources >= 5",
      `status=${res.status}, identities=${data.identities?.length}, resources=${data.resources?.length}`,
      pass
    );
  } catch (err: any) {
    record("2", "Authenticated GET returns real identities", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 3: Unauthenticated POST /api/access-control/evaluate (401)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: adminUser!.id,
        subjectType: "USER",
        action: "users.read",
        resource: "Users:Directory",
      }),
    });
    record("3", "Unauthenticated POST /api/access-control/evaluate rejected", "401", `${res.status}`, res.status === 401);
  } catch (err: any) {
    record("3", "Unauthenticated POST rejected", "401", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 4: Missing parameters rejected with 400
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: adminUser!.id,
        // missing action and resource
      }),
    });
    record("4", "Missing parameters in evaluation payload rejected with HTTP 400", "400", `${res.status}`, res.status === 400);
  } catch (err: any) {
    record("4", "Missing parameters rejected", "400", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 5: Human User with standing role evaluates to ALLOW
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: adminUser!.id,
        subjectType: "USER",
        action: "users.read",
        resource: "Users:Directory",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "ALLOW" && data.evaluation?.grantType === "PERMANENT_ROLE";
    record(
      "5",
      "Human user with standing role permission evaluates to ALLOW (PERMANENT_ROLE)",
      "ALLOW via PERMANENT_ROLE",
      `${data.evaluation?.decision} via ${data.evaluation?.grantType}`,
      pass
    );
  } catch (err: any) {
    record("5", "Human user with standing role evaluates to ALLOW", "ALLOW", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 6: Human User without permission evaluates to DENY
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: employeeUser!.id,
        subjectType: "USER",
        action: "roles.manage",
        resource: "Roles:Matrix",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "DENY";
    record(
      "6",
      "Human user without required capability evaluates to DENY (Least-Privilege)",
      "DENY",
      `${data.evaluation?.decision} (${data.evaluation?.reason})`,
      pass
    );
  } catch (err: any) {
    record("6", "Human user without capability evaluates to DENY", "DENY", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 7: Human User with active JIT elevation evaluates to ALLOW
  // -------------------------------------------------------------
  let jitTicketId = "";
  try {
    // Create an active JIT elevation for employee for users.delete
    const el = await prisma.privilegeElevation.create({
      data: {
        userId: employeeUser!.id,
        permissions: JSON.stringify(["users.delete"]),
        scope: "Users:Directory",
        justification: "Temporary contractor cleanup shift",
        status: "ACTIVE",
        requestedDuration: 60,
        approvedDuration: 60,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    jitTicketId = el.id;

    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: employeeUser!.id,
        subjectType: "USER",
        action: "users.delete",
        resource: "Users:Directory",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "ALLOW" && data.evaluation?.grantType === "JIT_ELEVATION";
    record(
      "7",
      "Human user with active JIT elevation evaluates to ALLOW (JIT_ELEVATION)",
      "ALLOW via JIT_ELEVATION",
      `${data.evaluation?.decision} via ${data.evaluation?.grantType}`,
      pass
    );
  } catch (err: any) {
    record("7", "Human user with active JIT elevation evaluates to ALLOW", "ALLOW", err.message, false);
  } finally {
    if (jitTicketId) {
      await prisma.privilegeElevation.delete({ where: { id: jitTicketId } }).catch(() => {});
    }
  }

  // -------------------------------------------------------------
  // TEST 8: AI Agent with standing role evaluates to ALLOW for standard task
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: testAgent.id,
        subjectType: "AGENT",
        action: "reports.read",
        resource: "Reports:General",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "ALLOW" && data.evaluation?.grantType === "PERMANENT_ROLE";
    record(
      "8",
      "AI Agent with standing role evaluates to ALLOW for low-risk resource",
      "ALLOW via PERMANENT_ROLE",
      `${data.evaluation?.decision} via ${data.evaluation?.grantType}`,
      pass
    );
  } catch (err: any) {
    record("8", "AI Agent with standing role evaluates to ALLOW", "ALLOW", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 9: AI Agent without permission evaluates to DENY
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: testAgent.id,
        subjectType: "AGENT",
        action: "audit.read",
        resource: "Audit:Logs",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "DENY";
    record(
      "9",
      "AI Agent without capability evaluates to DENY",
      "DENY",
      `${data.evaluation?.decision} (${data.evaluation?.reason})`,
      pass
    );
  } catch (err: any) {
    record("9", "AI Agent without capability evaluates to DENY", "DENY", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 10: AI Agent with active Delegation evaluates to ALLOW in scope
  // -------------------------------------------------------------
  let delegationTestId = "";
  try {
    const del = await prisma.delegation.create({
      data: {
        grantorId: adminUser!.id,
        agentId: testAgent.id,
        permissions: JSON.stringify(["reports.create"]),
        scope: "Reports:Sales",
        reason: "Delegating quarterly sales reporting generation",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    delegationTestId = del.id;

    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: testAgent.id,
        subjectType: "AGENT",
        action: "reports.create",
        resource: "Reports:Sales",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "ALLOW" && data.evaluation?.grantType === "DELEGATION";
    record(
      "10",
      "AI Agent with active human delegation evaluates to ALLOW in scope (DELEGATION)",
      "ALLOW via DELEGATION",
      `${data.evaluation?.decision} via ${data.evaluation?.grantType}`,
      pass
    );
  } catch (err: any) {
    record("10", "AI Agent with active delegation evaluates to ALLOW", "ALLOW", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 11: AI Agent with delegation targeting out-of-scope resource -> DENY
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: testAgent.id,
        subjectType: "AGENT",
        action: "reports.create",
        resource: "Reports:SensitiveFinancial", // Out-of-scope for sales delegation
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "DENY";
    record(
      "11",
      "AI Agent targeting resource outside delegated scope evaluates to DENY",
      "DENY",
      `${data.evaluation?.decision} (${data.evaluation?.reason})`,
      pass
    );
  } catch (err: any) {
    record("11", "AI Agent targeting out-of-scope resource evaluates to DENY", "DENY", err.message, false);
  } finally {
    if (delegationTestId) {
      await prisma.delegation.delete({ where: { id: delegationTestId } }).catch(() => {});
    }
  }

  // -------------------------------------------------------------
  // TEST 12: High-risk action without approval -> APPROVAL_REQUIRED
  // -------------------------------------------------------------
  try {
    // Give agent delegation for users.create on Users:Directory
    const highRiskDel = await prisma.delegation.create({
      data: {
        grantorId: adminUser!.id,
        agentId: testAgent.id,
        permissions: JSON.stringify(["users.create"]),
        scope: "Users:Directory",
        reason: "Automated onboarding delegation",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: testAgent.id,
        subjectType: "AGENT",
        action: "users.create",
        resource: "Users:Directory",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "APPROVAL_REQUIRED";
    record(
      "12",
      "AI Agent attempting high-risk action requires supervisory signoff (APPROVAL_REQUIRED)",
      "APPROVAL_REQUIRED",
      `${data.evaluation?.decision} (${data.evaluation?.policyRule})`,
      pass
    );

    await prisma.delegation.delete({ where: { id: highRiskDel.id } }).catch(() => {});
  } catch (err: any) {
    record("12", "High risk action requires approval", "APPROVAL_REQUIRED", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 13: Suspended AI Agent evaluates to DENY
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: suspendedAgent.id,
        subjectType: "AGENT",
        action: "reports.read",
        resource: "Reports:General",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "DENY" && data.evaluation?.subjectStatus === "SUSPENDED";
    record(
      "13",
      "Suspended machine identity evaluates to DENY with lifecycle policy",
      "DENY with status=SUSPENDED",
      `${data.evaluation?.decision} (status=${data.evaluation?.subjectStatus})`,
      pass
    );
  } catch (err: any) {
    record("13", "Suspended AI agent evaluates to DENY", "DENY", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 14: Unknown/nonexistent identity evaluates to DENY
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: "nonexistent-identity-cuid",
        subjectType: "USER",
        action: "users.read",
        resource: "Users:Directory",
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.evaluation?.decision === "DENY" && data.evaluation?.subjectStatus === "NOT_FOUND";
    record(
      "14",
      "Nonexistent subject identity evaluates to DENY (SEC-POL-001)",
      "DENY (NOT_FOUND)",
      `${data.evaluation?.decision} (${data.evaluation?.subjectStatus})`,
      pass
    );
  } catch (err: any) {
    record("14", "Nonexistent identity evaluates to DENY", "DENY", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 15: Policy evaluation recorded in AuditLog table
  // -------------------------------------------------------------
  try {
    const lastAudit = await prisma.auditLog.findFirst({
      where: { action: "POLICY_EVALUATION_EXECUTED" },
      orderBy: { timestamp: "desc" },
    });
    const pass = Boolean(lastAudit && lastAudit.userId === adminUser!.id);
    record(
      "15",
      "Policy evaluation executions are persistently recorded in AuditLog table",
      "AuditLog entry with action=POLICY_EVALUATION_EXECUTED",
      `Found audit record ID: ${lastAudit?.id}, action: ${lastAudit?.action}`,
      pass
    );
  } catch (err: any) {
    record("15", "Policy evaluation recorded in AuditLog", "Recorded", err.message, false);
  }

  // -------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------
  console.log("=============================================================");
  console.log("                  TEST SUITE EXECUTION SUMMARY               ");
  console.log("=============================================================");
  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;
  console.log(`Total Tests Executed: ${results.length}`);
  console.log(`Passed:               ${passedCount}`);
  console.log(`Failed:               ${failedCount}`);
  console.log("=============================================================");

  // Cleanup
  await prisma.agent.delete({ where: { id: testAgent.id } }).catch(() => {});
  await prisma.agent.delete({ where: { id: suspendedAgent.id } }).catch(() => {});

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

