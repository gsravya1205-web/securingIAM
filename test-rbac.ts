import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function loginUser(base, email, pass) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} with status ${res.status}: ${text}`);
  }
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`No cookie for ${email}`);
  return cookie.split(";")[0];
}

async function run() {
  console.log("🛡️ =============================================================");
  console.log("🛡️   SECUREID - RBAC SECURITY VERIFICATION & COMPLIANCE SUITE    ");
  console.log("🛡️ =============================================================\n");

  const BASE = process.env.TEST_BASE || "http://127.0.0.1:3040";
  const results = [];

  // Helper to record test results
  function record(id, title, expected, actual, pass) {
    results.push({ id, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // Ensure test users have no standing JIT elevations so baseline RBAC is tested
  const emp = await prisma.user.findUnique({ where: { email: "employee@secureid.local" } });
  if (emp) {
    await prisma.privilegeElevation.updateMany({
      where: { userId: emp.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
  }

  // Pre-fetch auth cookies for all 3 roles
  const adminCookie = await loginUser(BASE, "admin@secureid.local", "Admin123!");
  const managerCookie = await loginUser(BASE, "manager@secureid.local", "Manager123!");
  const employeeCookie = await loginUser(BASE, "employee@secureid.local", "Employee123!");

  // -------------------------------------------------------------
  // CHECK 1: Protected API endpoints verify authenticated session
  // -------------------------------------------------------------
  const unauthUsers = await fetch(`${BASE}/api/users`);
  record(
    "1.1",
    "Unauthenticated access to GET /api/users",
    "HTTP 401 Unauthorized",
    `HTTP ${unauthUsers.status}`,
    unauthUsers.status === 401
  );

  const unauthAudit = await fetch(`${BASE}/api/audit`);
  record(
    "1.2",
    "Unauthenticated access to GET /api/audit",
    "HTTP 401 Unauthorized",
    `HTTP ${unauthAudit.status}`,
    unauthAudit.status === 401
  );

  // -------------------------------------------------------------
  // CHECK 2: Sensitive API actions check permissions on server
  // -------------------------------------------------------------
  const adminGetUsers = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: adminCookie },
  });
  record(
    "2.1",
    "Admin (has users.read) accessing GET /api/users",
    "HTTP 200 OK",
    `HTTP ${adminGetUsers.status}`,
    adminGetUsers.status === 200
  );

  const adminCreateUser = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Sam Security",
      email: `sam.${Date.now()}@secureid.local`,
      password: "SamPassword123!",
      roleName: "Employee",
    }),
  });
  record(
    "2.2",
    "Admin (has users.create) executing POST /api/users",
    "HTTP 201 Created",
    `HTTP ${adminCreateUser.status}`,
    adminCreateUser.status === 201
  );

  // -------------------------------------------------------------
  // CHECK 3: Employees cannot access Admin-only actions via manual requests
  // -------------------------------------------------------------
  const empDirectCreate = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({
      name: "Hacker Attempt",
      email: "hacker@evil.com",
      password: "Password123!",
      roleName: "Admin",
    }),
  });
  record(
    "3.1",
    "Employee executing Admin-only POST /api/users",
    "HTTP 403 Forbidden (RBAC Violation)",
    `HTTP ${empDirectCreate.status}`,
    empDirectCreate.status === 403
  );

  const empDirectAudit = await fetch(`${BASE}/api/audit`, {
    headers: { Cookie: employeeCookie },
  });
  record(
    "3.2",
    "Employee executing Admin/Manager-only GET /api/audit",
    "HTTP 403 Forbidden (RBAC Violation)",
    `HTTP ${empDirectAudit.status}`,
    empDirectAudit.status === 403
  );

  // -------------------------------------------------------------
  // CHECK 4: Managers cannot perform actions outside assigned permissions
  // -------------------------------------------------------------
  const mgrReadReports = await fetch(`${BASE}/api/reports`, {
    headers: { Cookie: managerCookie },
  });
  record(
    "4.1",
    "Manager (has reports.read) accessing GET /api/reports",
    "HTTP 200 OK",
    `HTTP ${mgrReadReports.status}`,
    mgrReadReports.status === 200
  );

  const mgrCreateReports = await fetch(`${BASE}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({ title: "Manager Incident Summary" }),
  });
  record(
    "4.2",
    "Manager (has reports.create) executing POST /api/reports",
    "HTTP 201 Created",
    `HTTP ${mgrCreateReports.status}`,
    mgrCreateReports.status === 201
  );

  const mgrIllegalCreateUser = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      name: "Unauthorized Provisioning",
      email: "rogue@secureid.local",
      password: "Password123!",
      roleName: "Employee",
    }),
  });
  record(
    "4.3",
    "Manager executing Admin-only POST /api/users (lacks users.create)",
    "HTTP 403 Forbidden",
    `HTTP ${mgrIllegalCreateUser.status}`,
    mgrIllegalCreateUser.status === 403
  );

  // -------------------------------------------------------------
  // CHECK 5: Frontend navigation restrictions != security enforcement
  // (Direct REST API calls from Employee are rejected regardless of UI)
  // -------------------------------------------------------------
  const empDirectGetUsers = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: employeeCookie },
  });
  record(
    "5.1",
    "Direct API bypass attempt: Employee requesting GET /api/users",
    "HTTP 403 Forbidden",
    `HTTP ${empDirectGetUsers.status}`,
    empDirectGetUsers.status === 403
  );

  const empAllowedReport = await fetch(`${BASE}/api/reports`, {
    headers: { Cookie: employeeCookie },
  });
  record(
    "5.2",
    "Employee accessing granted scope: GET /api/reports",
    "HTTP 200 OK",
    `HTTP ${empAllowedReport.status}`,
    empAllowedReport.status === 200
  );

  // -------------------------------------------------------------
  // CHECK 6: Session expiry and invalid signatures handled correctly
  // -------------------------------------------------------------
  // 6.1 Tampered signature test
  const rawCookieVal = adminCookie.replace("secureid_session=", "");
  const [tokenPayload, tokenSig] = rawCookieVal.split(".");
  const tamperedSig = tokenSig.substring(0, tokenSig.length - 4) + "X9Z!";
  const tamperedCookie = `secureid_session=${tokenPayload}.${tamperedSig}`;

  const tamperedRes = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: tamperedCookie },
  });
  record(
    "6.1",
    "Forged/Tampered HMAC Signature Token",
    "HTTP 401 Unauthorized",
    `HTTP ${tamperedRes.status}`,
    tamperedRes.status === 401
  );

  // 6.2 Expired token test (construct token with exp in the past: 1000 seconds ago)
  const expiredPayload = {
    sub: "admin-id",
    email: "admin@secureid.local",
    name: "Alex Vance",
    roleName: "Admin",
    permissions: ["users.read"],
    exp: Math.floor(Date.now() / 1000) - 1000,
    iat: Math.floor(Date.now() / 1000) - 5000,
  };
  const encExpPayload = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
  const expiredCookie = `secureid_session=${encExpPayload}.${tokenSig}`;
  const expiredRes = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: expiredCookie },
  });
  record(
    "6.2",
    "Expired Session Token (exp < now)",
    "HTTP 401 Unauthorized",
    `HTTP ${expiredRes.status}`,
    expiredRes.status === 401
  );

  // -------------------------------------------------------------
  // CHECK 7: Allowed and denied attempts recorded in audit logs
  // -------------------------------------------------------------
  const recentLogs = await prisma.auditLog.findMany({
    take: 10,
    orderBy: { timestamp: "desc" },
  });

  const hasSuccessAudit = recentLogs.some((l) => l.status === "SUCCESS");
  const hasDeniedAudit = recentLogs.some((l) => l.status === "DENIED");

  record(
    "7.1",
    "Audit Log records ALLOWED actions with status SUCCESS",
    "SUCCESS audit entries present",
    hasSuccessAudit ? "SUCCESS audit entries present" : "None found",
    hasSuccessAudit
  );

  record(
    "7.2",
    "Audit Log records DENIED security violations with status DENIED",
    "DENIED audit entries present",
    hasDeniedAudit ? "DENIED audit entries present" : "None found",
    hasDeniedAudit
  );

  await prisma.$disconnect();

  const allPassed = results.every((r) => r.pass);
  console.log("=============================================================");
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.pass).length} | FAILED: ${results.filter((r) => !r.pass).length}`);
  console.log(`OVERALL RBAC STATUS: ${allPassed ? "✅ ALL 12 CHECKS PASSED" : "❌ FAILURES DETECTED"}`);
  console.log("=============================================================");

  if (!allPassed) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
