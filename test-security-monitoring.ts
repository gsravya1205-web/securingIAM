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
  console.log("🛡️   SECUREID - PHASE 8: SECURITY MONITORING & POLICIES TEST   ");
  console.log("🛡️ =============================================================\n");

  const adminCookie = await loginUser("admin@secureid.local", "admin123");
  const employeeCookie = await loginUser("employee@secureid.local", "employee123");

  // -------------------------------------------------------------
  // TEST 1: Unauthenticated GET /api/monitoring/security-events (401)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/monitoring/security-events`);
    record("1", "Unauthenticated GET /api/monitoring/security-events rejected", "401", `${res.status}`, res.status === 401);
  } catch (err: any) {
    record("1", "Unauthenticated GET rejected", "401", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 2: Authenticated GET /api/monitoring/security-events returns posture
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/monitoring/security-events`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();
    const pass = res.status === 200 && data.posture && typeof data.posture.activeAgentsCount === "number";
    record(
      "2",
      "Authenticated GET returns real-time security posture summary",
      "status=200 with posture metrics",
      `status=${res.status}, activeAgents=${data.posture?.activeAgentsCount}, alerts=${data.posture?.activeAlerts?.length}`,
      pass
    );
  } catch (err: any) {
    record("2", "Security posture summary check", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 3: Unauthenticated GET /api/settings/security-policies (401)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/settings/security-policies`);
    record("3", "Unauthenticated GET /api/settings/security-policies rejected", "401", `${res.status}`, res.status === 401);
  } catch (err: any) {
    record("3", "Unauthenticated policy read", "401", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 4: Authenticated GET /api/settings/security-policies returns policy defaults
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/settings/security-policies`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();
    const pass = res.status === 200 && data.policies?.maxJitDurationMinutes >= 60;
    record(
      "4",
      "Authenticated GET returns enterprise security policies",
      "status=200 with maxJitDurationMinutes",
      `status=${res.status}, maxJit=${data.policies?.maxJitDurationMinutes}m, maxDelegation=${data.policies?.maxDelegationDurationMinutes}m`,
      pass
    );
  } catch (err: any) {
    record("4", "Security policies check", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 5: Employee blocked from modifying security policies (403)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/settings/security-policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ maxJitDurationMinutes: 180 }),
    });
    record("5", "Employee blocked from modifying security policies (403)", "403", `${res.status}`, res.status === 403);
  } catch (err: any) {
    record("5", "Employee blocked from policy modification", "403", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 6: Admin updates security policies (200)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/settings/security-policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        maxJitDurationMinutes: 180,
        maxDelegationDurationMinutes: 720,
        defaultAgentRateLimit: 150,
      }),
    });
    const data = await res.json();
    const pass = res.status === 200 && data.policies?.maxJitDurationMinutes === 180;
    record(
      "6",
      "Admin updates enterprise security policies (200)",
      "status=200, maxJit=180",
      `status=${res.status}, maxJit=${data.policies?.maxJitDurationMinutes}m`,
      pass
    );
  } catch (err: any) {
    record("6", "Admin updates security policies", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 7: Invalid policy durations rejected with 400
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/settings/security-policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ maxJitDurationMinutes: 1000 }), // excessive
    });
    record("7", "Excessive policy duration rejected with HTTP 400", "400", `${res.status}`, res.status === 400);
  } catch (err: any) {
    record("7", "Excessive policy duration rejected", "400", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 8: Emergency Kill-Switch Activation & Verification
  // -------------------------------------------------------------
  try {
    const activateRes = await fetch(`${BASE}/api/monitoring/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ action: "ACTIVATE" }),
    });
    const activateData = await activateRes.json();
    const passActivate = activateRes.status === 200 && typeof activateData.suspendedCount === "number";

    // Deactivate kill-switch to restore agents
    const deactivateRes = await fetch(`${BASE}/api/monitoring/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ action: "DEACTIVATE" }),
    });
    const deactivateData = await deactivateRes.json();
    const passDeactivate = deactivateRes.status === 200 && typeof deactivateData.reactivatedCount === "number";

    record(
      "8",
      "Emergency Kill-Switch cycle (Activate -> Freeze -> Deactivate -> Restore)",
      "Activate=200, Deactivate=200",
      `Activate=${activateRes.status} (Suspended: ${activateData.suspendedCount}), Deactivate=${deactivateRes.status} (Reactivated: ${deactivateData.reactivatedCount})`,
      passActivate && passDeactivate
    );
  } catch (err: any) {
    record("8", "Emergency kill-switch cycle", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 9: Policy updates recorded in AuditLog table
  // -------------------------------------------------------------
  try {
    const audit = await prisma.auditLog.findFirst({
      where: { action: "SECURITY_POLICY_UPDATED" },
      orderBy: { timestamp: "desc" },
    });
    const pass = Boolean(audit);
    record(
      "9",
      "Security policy changes are recorded in immutable AuditLog",
      "AuditLog entry found",
      `Found audit ID: ${audit?.id}, details: ${audit?.details}`,
      pass
    );
  } catch (err: any) {
    record("9", "Security policy changes recorded in AuditLog", "Found", err.message, false);
  }

  // -------------------------------------------------------------
  // SUMMARY
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
