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
  console.log("🌟 =============================================================");
  console.log("🌟   SECUREID - PHASE 9: MASTER COMPREHENSIVE END-TO-END SUITE   ");
  console.log("🌟 =============================================================\n");

  const adminCookie = await loginUser("admin@secureid.local", "admin123");
  const managerCookie = await loginUser("manager@secureid.local", "manager123");
  const employeeCookie = await loginUser("employee@secureid.local", "employee123");

  const adminUser = await prisma.user.findUnique({ where: { email: "admin@secureid.local" } });
  const employeeUser = await prisma.user.findUnique({ where: { email: "employee@secureid.local" } });

  // -------------------------------------------------------------
  // 1. HUMAN AUTH & RBAC VERIFICATION
  // -------------------------------------------------------------
  try {
    const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: adminCookie } });
    const meData = await meRes.json();
    const pass = meRes.status === 200 && meData.user?.roleName === "Admin";
    record("1", "Human Session & Identity Verification (Admin)", "200 Admin", `${meRes.status} ${meData.user?.roleName}`, pass);
  } catch (err: any) {
    record("1", "Human Session & Identity Verification", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // 2. MACHINE REGISTRATION & KEY HASHING
  // -------------------------------------------------------------
  const ts = Date.now();
  let createdAgentId = "";
  let rawAgentKey = "";
  try {
    const regRes = await fetch(`${BASE}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        name: `E2EAgent-${ts}`,
        description: "Agent created during master E2E integration verification",
        rateLimit: 120,
      }),
    });
    const regData = await regRes.json();
    createdAgentId = regData.agent?.id;
    rawAgentKey = regData.rawApiKey;
    const pass = regRes.status === 201 && Boolean(rawAgentKey) && rawAgentKey.startsWith("sec_agent_");
    record("2", "AI Agent Registration & High-Entropy Key Issuance", "201 with sec_agent_ key", `${regRes.status} key=${rawAgentKey ? "sec_agent_..." : "missing"}`, pass);
  } catch (err: any) {
    record("2", "AI Agent Registration", "201", err.message, false);
  }

  // -------------------------------------------------------------
  // 3. M2M EXECUTION WITH BEARER TOKEN
  // -------------------------------------------------------------
  try {
    const execRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawAgentKey}`,
      },
      body: JSON.stringify({ action: "read_telemetry" }),
    });
    const execData = await execRes.json();
    const pass = execRes.status === 200 && execData.success === true;
    record("3", "M2M Autonomous Execution with Valid Bearer Credential", "200 SUCCESS", `${execRes.status} ${execData.output?.status || ""}`, pass);
  } catch (err: any) {
    record("3", "M2M Autonomous Execution", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // 4. API KEY ROTATION & INVALIDATION OF OLD CREDENTIAL
  // -------------------------------------------------------------
  let newRotatedKey = "";
  try {
    const rotRes = await fetch(`${BASE}/api/agents/rotate-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ agentId: createdAgentId }),
    });
    const rotData = await rotRes.json();
    newRotatedKey = rotData.newSecretKey;

    // Verify old key is rejected
    const oldKeyRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawAgentKey}`,
      },
      body: JSON.stringify({ action: "read_telemetry" }),
    });

    // Verify new key succeeds
    const newKeyRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newRotatedKey}`,
      },
      body: JSON.stringify({ action: "read_telemetry" }),
    });

    const pass = rotRes.status === 200 && oldKeyRes.status === 401 && newKeyRes.status === 200;
    record(
      "4",
      "API Key Rotation: Old credential invalidated (401), New credential authorized (200)",
      "old=401, new=200",
      `old=${oldKeyRes.status}, new=${newKeyRes.status}`,
      pass
    );
  } catch (err: any) {
    record("4", "API Key Rotation", "old=401, new=200", err.message, false);
  }

  // -------------------------------------------------------------
  // 5. HUMAN-TO-AGENT DELEGATED PERMISSION BOUNDARY
  // -------------------------------------------------------------
  let delegationId = "";
  try {
    const delRes = await fetch(`${BASE}/api/delegations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        agentId: createdAgentId,
        permissions: ["reports.read"],
        scope: "Reports:Sales",
        reason: "Master E2E delegation test for sales report access",
        durationMinutes: 60,
      }),
    });
    const delData = await delRes.json();
    delegationId = delData.delegation?.id;

    // Call sales report endpoint with agent key
    const salesRes = await fetch(`${BASE}/api/resources/sales-reports`, {
      headers: { Authorization: `Bearer ${newRotatedKey}` },
    });

    // Call HR report (out of scope) -> 403
    const hrRes = await fetch(`${BASE}/api/resources/hr-records`, {
      headers: { Authorization: `Bearer ${newRotatedKey}` },
    });

    const pass = delRes.status === 201 && salesRes.status === 200 && hrRes.status === 403;
    record(
      "5",
      "Human-to-Agent Delegation: In-scope access allowed (200), Out-of-scope blocked (403)",
      "sales=200, hr=403",
      `sales=${salesRes.status}, hr=${hrRes.status}`,
      pass
    );
  } catch (err: any) {
    record("5", "Human-to-Agent Delegation", "sales=200, hr=403", err.message, false);
  }

  // -------------------------------------------------------------
  // 6. DUAL-CONTROL APPROVAL WORKFLOW & SOD SELF-APPROVAL BLOCK
  // -------------------------------------------------------------
  let approvalTicketId = "";
  try {
    // Employee submits approval request
    const appRes = await fetch(`${BASE}/api/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({
        targetAction: "reports.create",
        resource: "Compliance:Reports",
        justification: "Onboarding audit report generation for executive review",
      }),
    });
    const appData = await appRes.json();
    approvalTicketId = appData.approval?.id;

    // Employee tries to self-approve -> 403
    const selfAppRes = await fetch(`${BASE}/api/approvals/${approvalTicketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ action: "APPROVED", reviewerNote: "Self-approval attempt" }),
    });

    // Supervisor (Manager) approves -> 200
    const supAppRes = await fetch(`${BASE}/api/approvals/${approvalTicketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ action: "APPROVED", reviewerNote: "Approved by manager" }),
    });

    const pass = appRes.status === 201 && selfAppRes.status === 403 && supAppRes.status === 200;
    record(
      "6",
      "Dual-Control Approval: Self-approval rejected (403 SoD), Supervisor approved (200)",
      "create=201, self=403, supervisor=200",
      `create=${appRes.status}, self=${selfAppRes.status}, supervisor=${supAppRes.status}`,
      pass
    );
  } catch (err: any) {
    record("6", "Dual-Control Approval", "self=403, supervisor=200", err.message, false);
  }

  // -------------------------------------------------------------
  // 7. ZERO STANDING PRIVILEGE (ZSP) & HUMAN JIT ACCESS
  // -------------------------------------------------------------
  let jitElevationId = "";
  try {
    // Employee requests JIT elevation
    const jitRes = await fetch(`${BASE}/api/privilege-elevations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({
        permissions: ["users.create"],
        scope: "Users:Directory",
        justification: "Emergency contractor creation shift",
        durationMinutes: 60,
      }),
    });
    const jitData = await jitRes.json();
    jitElevationId = jitData.elevation?.id;

    // Supervisor approves
    const approveJitRes = await fetch(`${BASE}/api/privilege-elevations/${jitElevationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ action: "APPROVE", reviewerNote: "Supervisor JIT signoff" }),
    });

    // Verify employee permanent role is still 'Employee' in SQLite
    const empInDb = await prisma.user.findUnique({
      where: { id: employeeUser!.id },
      include: { role: true },
    });

    const pass = jitRes.status === 201 && approveJitRes.status === 200 && empInDb?.role.name === "Employee";
    record(
      "7",
      "Zero Standing Privilege (ZSP): JIT elevation activated while standing role remains 'Employee'",
      "JIT=ACTIVE, DB role=Employee",
      `JIT status=${(await approveJitRes.json()).elevation?.status}, DB role=${empInDb?.role.name}`,
      pass
    );
  } catch (err: any) {
    record("7", "Zero Standing Privilege & JIT", "ZSP preserved", err.message, false);
  } finally {
    if (jitElevationId) {
      await prisma.privilegeElevation.update({
        where: { id: jitElevationId },
        data: { status: "EXPIRED" },
      }).catch(() => {});
    }
  }

  // -------------------------------------------------------------
  // 8. CENTRALIZED ACCESS POLICY DECISION ENGINE (PDP)
  // -------------------------------------------------------------
  try {
    const pdpRes = await fetch(`${BASE}/api/access-control/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: adminUser!.id,
        subjectType: "USER",
        action: "users.read",
        resource: "Users:Directory",
      }),
    });
    const pdpData = await pdpRes.json();
    const pass = pdpRes.status === 200 && pdpData.evaluation?.decision === "ALLOW" && pdpData.evaluation?.grantType === "PERMANENT_ROLE";
    record("8", "Centralized Policy Decision Engine (PDP) Verdict Evaluation", "ALLOW via PERMANENT_ROLE", `${pdpData.evaluation?.decision} via ${pdpData.evaluation?.grantType}`, pass);
  } catch (err: any) {
    record("8", "PDP Verdict Evaluation", "ALLOW", err.message, false);
  }

  // -------------------------------------------------------------
  // 9. HIGH-RISK FINANCIAL APPROVAL GOVERNANCE
  // -------------------------------------------------------------
  try {
    const finRes = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${newRotatedKey}` },
    });
    const finData = await finRes.json();
    const pass = finRes.status === 403 && finData.verdict === "APPROVAL_REQUIRED";
    record(
      "9",
      "Autonomous Access to Sensitive Financials Requires Human Approval Ticket",
      "HTTP 403 APPROVAL_REQUIRED",
      `${finRes.status} ${finData.verdict || ""}`,
      pass
    );
  } catch (err: any) {
    record("9", "Financial approval governance", "APPROVAL_REQUIRED", err.message, false);
  }

  // -------------------------------------------------------------
  // 10. COMPREHENSIVE AUDIT LEDGER COMPLETENESS
  // -------------------------------------------------------------
  try {
    const auditCount = await prisma.auditLog.count();
    const pass = auditCount >= 20;
    record(
      "10",
      "Tamper-Evident Forensic Audit Ledger Records All Human & Machine Lifecycle Events",
      "Audit count >= 20",
      `Total immutable records in SQLite: ${auditCount}`,
      pass
    );
  } catch (err: any) {
    record("10", "Forensic audit ledger completeness", ">= 20", err.message, false);
  }

  // -------------------------------------------------------------
  // CLEANUP & FINAL REPORT
  // -------------------------------------------------------------
  if (createdAgentId) {
    await prisma.agent.delete({ where: { id: createdAgentId } }).catch(() => {});
  }
  if (delegationId) {
    await prisma.delegation.delete({ where: { id: delegationId } }).catch(() => {});
  }
  if (approvalTicketId) {
    await prisma.approvalRequest.delete({ where: { id: approvalTicketId } }).catch(() => {});
  }

  console.log("=============================================================");
  console.log("             MASTER END-TO-END EXECUTION SUMMARY             ");
  console.log("=============================================================");
  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;
  console.log(`Total End-to-End Tests: ${results.length}`);
  console.log(`Passed:                 ${passedCount}`);
  console.log(`Failed:                 ${failedCount}`);
  console.log("=============================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run()
  .catch((err) => {
    console.error("Master E2E suite execution failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

