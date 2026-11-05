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
  console.log("🤖 =============================================================");
  console.log("🤖   SECUREID - PHASE 7: AGENT PLAYGROUND & 10 SCENARIOS TEST   ");
  console.log("🤖 =============================================================\n");

  const adminCookie = await loginUser("admin@secureid.local", "admin123");

  // -------------------------------------------------------------
  // TEST 1: GET /api/demonstration/run-scenario metadata
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE}/api/demonstration/run-scenario`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();
    const pass = res.status === 200 && data.agent?.name === "SecureID Research Assistant" && data.scenarios?.length === 10;
    record(
      "1",
      "GET /api/demonstration/run-scenario returns SecureID Research Assistant and 10 scenarios",
      "200, agent='SecureID Research Assistant', 10 scenarios",
      `status=${res.status}, agent='${data.agent?.name}', scenarios=${data.scenarios?.length}`,
      pass
    );
  } catch (err: any) {
    record("1", "Playground metadata endpoint check", "200", err.message, false);
  }

  // -------------------------------------------------------------
  // TEST 2 - 11: Execute all 10 Scenarios via POST /api/demonstration/run-scenario
  // -------------------------------------------------------------
  const scenarioExpectations: Record<number, { title: string; expectedVerdict: string; expectedStatus: number }> = {
    1: { title: "Scenario 1: Authorized Access to General Analytics Reports", expectedVerdict: "ALLOW", expectedStatus: 200 },
    2: { title: "Scenario 2: Unauthorized Access Attempt to Restricted HR Records", expectedVerdict: "DENY", expectedStatus: 403 },
    3: { title: "Scenario 3: Delegated Access to Sales Reports", expectedVerdict: "ALLOW", expectedStatus: 200 },
    4: { title: "Scenario 4: Out-of-Scope Resource Access", expectedVerdict: "DENY", expectedStatus: 403 },
    5: { title: "Scenario 5: Revoked Delegation Access", expectedVerdict: "DENY", expectedStatus: 403 },
    6: { title: "Scenario 6: Human JIT Privilege Elevation", expectedVerdict: "ALLOW", expectedStatus: 200 },
    7: { title: "Scenario 7: Temporal Expiration (TTL Elapsed)", expectedVerdict: "DENY", expectedStatus: 403 },
    8: { title: "Scenario 8: Dual-Control Approval Requirement", expectedVerdict: "APPROVAL_REQUIRED", expectedStatus: 403 },
    9: { title: "Scenario 9: Suspended Agent Isolation", expectedVerdict: "DENY", expectedStatus: 403 },
    10: { title: "Scenario 10: Emergency Kill-Switch Fleet Freeze", expectedVerdict: "DENY", expectedStatus: 403 },
  };

  for (let sId = 1; sId <= 10; sId++) {
    const exp = scenarioExpectations[sId];
    try {
      const res = await fetch(`${BASE}/api/demonstration/run-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ scenarioId: sId }),
      });
      const data = await res.json();
      const actualVerdict = data.result?.actualVerdict;
      const actualStatus = data.result?.actualStatus;
      const pass = res.status === 200 && actualVerdict === exp.expectedVerdict && actualStatus === exp.expectedStatus;

      record(
        `${sId + 1}`,
        exp.title,
        `verdict=${exp.expectedVerdict}, status=${exp.expectedStatus}`,
        `verdict=${actualVerdict}, status=${actualStatus}`,
        pass
      );
    } catch (err: any) {
      record(`${sId + 1}`, exp.title, `verdict=${exp.expectedVerdict}`, err.message, false);
    }
  }

  // -------------------------------------------------------------
  // TEST 12: AuditLog entries for executed demonstration scenarios
  // -------------------------------------------------------------
  try {
    const demoAudits = await prisma.auditLog.findMany({
      where: { action: "DEMO_SCENARIO_EXECUTED" },
      take: 10,
    });
    const pass = demoAudits.length >= 5;
    record(
      "12",
      "Demonstration executions are persistently recorded in AuditLog table",
      "Count >= 5",
      `Found ${demoAudits.length} scenario execution audit records`,
      pass
    );
  } catch (err: any) {
    record("12", "AuditLog entries recorded", "Count >= 5", err.message, false);
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

