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
  console.log("🛡️   SECUREID - PHASE 3: DELEGATED AUTHORIZATION TEST SUITE    ");
  console.log("🛡️ =============================================================\n");

  // 1. Authenticate users
  const adminCookie = await loginUser("admin@secureid.local", "Admin123!");
  const managerCookie = await loginUser("manager@secureid.local", "Manager123!");
  const employeeCookie = await loginUser("employee@secureid.local", "Employee123!");

  // 2. Provision two dedicated test agents
  const ts = Date.now();
  const createAgentA = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: `DelegationAgentA-${ts}`,
      description: "Primary agent for delegation testing",
      rateLimit: 120,
    }),
  });
  const agentAData = await createAgentA.json();
  const agentAId = agentAData.agent.id;
  const rawKeyA = agentAData.rawApiKey;

  const createAgentB = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: `DelegationAgentB-${ts}`,
      description: "Secondary agent for cross-agent isolation testing",
      rateLimit: 120,
    }),
  });
  const agentBData = await createAgentB.json();
  const agentBId = agentBData.agent.id;
  const rawKeyB = agentBData.rawApiKey;

  // Provision an inactive/suspended agent
  const createAgentInactive = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: `InactiveAgent-${ts}`,
      description: "Inactive agent for status testing",
      rateLimit: 60,
    }),
  });
  const inactiveAgentData = await createAgentInactive.json();
  const inactiveAgentId = inactiveAgentData.agent.id;
  // Suspend it
  await fetch(`${BASE}/api/agents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: inactiveAgentId, status: "SUSPENDED" }),
  });

  // -------------------------------------------------------------
  // TEST 1: Unauthenticated human cannot create delegation
  // -------------------------------------------------------------
  const unauthRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: agentAId,
      permissions: ["reports.read"],
      reason: "Unauthenticated delegation attempt",
    }),
  });
  record(
    "1",
    "Unauthenticated human cannot create delegation",
    "HTTP 401 Unauthorized",
    `HTTP ${unauthRes.status}`,
    unauthRes.status === 401
  );

  // -------------------------------------------------------------
  // TEST 2: AI agent cannot create human delegation
  // -------------------------------------------------------------
  const agentCreateAttempt = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({
      agentId: agentBId,
      permissions: ["reports.read"],
      reason: "Agent attempting to delegate authority",
    }),
  });
  record(
    "2",
    "AI agent cannot create human delegation",
    "HTTP 403 Forbidden",
    `HTTP ${agentCreateAttempt.status}`,
    agentCreateAttempt.status === 403
  );

  // -------------------------------------------------------------
  // TEST 3: Authorized human can create a valid delegation
  // -------------------------------------------------------------
  // Admin Alex Vance delegates "users.read" (which Agent A doesn't have) scoped to "Sales Directory"
  const validDelegationRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      agentId: agentAId,
      permissions: ["users.read"],
      scope: "Sales Directory",
      reason: "Allow Research Assistant to index regional sales representatives",
      expiresInHours: 4,
    }),
  });
  const validDelegationData = await validDelegationRes.json();
  const delegationAId = validDelegationData.delegation?.id;

  record(
    "3",
    "Authorized human can create a valid delegation grant",
    "HTTP 201 Created with status ACTIVE",
    `HTTP ${validDelegationRes.status}, status: ${validDelegationData.delegation?.status}`,
    validDelegationRes.status === 201 && validDelegationData.delegation?.status === "ACTIVE"
  );

  // -------------------------------------------------------------
  // TEST 4: Human cannot delegate a permission they do not possess
  // -------------------------------------------------------------
  // Employee Taylor Brooks only possesses "reports.read". Attempts to delegate "users.read"
  const unpossessedRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({
      agentId: agentAId,
      permissions: ["users.read"],
      reason: "Employee attempting privilege escalation via delegation",
      expiresInHours: 2,
    }),
  });
  const unpossessedData = await unpossessedRes.json();

  record(
    "4",
    "Human cannot delegate a permission they do not possess (Permission Boundary)",
    "HTTP 403 Forbidden with permission boundary error",
    `HTTP ${unpossessedRes.status}: ${unpossessedData.error}`,
    unpossessedRes.status === 403 && unpossessedData.error?.includes("Permission boundary violation")
  );

  // -------------------------------------------------------------
  // TEST 5: Invalid permissions are rejected
  // -------------------------------------------------------------
  const invalidPermRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      agentId: agentAId,
      permissions: ["nonexistent.superadmin.grant"],
      reason: "Attempting to delegate invalid permission code",
      expiresInHours: 2,
    }),
  });
  record(
    "5",
    "Invalid permissions rejected",
    "HTTP 400 Bad Request",
    `HTTP ${invalidPermRes.status}`,
    invalidPermRes.status === 400
  );

  // -------------------------------------------------------------
  // TEST 6: Inactive agents cannot receive delegation
  // -------------------------------------------------------------
  const inactiveAgentRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      agentId: inactiveAgentId,
      permissions: ["reports.read"],
      reason: "Attempting delegation to suspended agent",
      expiresInHours: 2,
    }),
  });
  record(
    "6",
    "Inactive agents cannot receive delegation",
    "HTTP 400 Bad Request",
    `HTTP ${inactiveAgentRes.status}`,
    inactiveAgentRes.status === 400
  );

  // -------------------------------------------------------------
  // TEST 7: Delegated permission allows the correct agent action
  // -------------------------------------------------------------
  // Agent A has delegated "users.read" on "Sales Directory". Calls execute!
  const execAllowedRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({
      action: "query_user_directory",
      resource: "Sales Directory",
    }),
  });
  const execAllowedData = await execAllowedRes.json();

  record(
    "7",
    "Delegated permission allows the correct agent action",
    "HTTP 200 OK with delegatedAuthUsed info",
    `HTTP ${execAllowedRes.status}, delegation used: ${execAllowedData.delegationDetails?.delegationId}`,
    execAllowedRes.status === 200 &&
      execAllowedData.delegationDetails?.delegationId === delegationAId
  );

  // -------------------------------------------------------------
  // TEST 8: Agent cannot use delegated permission outside resource scope
  // -------------------------------------------------------------
  // Agent A attempts to use "users.read" on "Executive Payroll" (outside "Sales Directory")
  const execOutOfScopeRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({
      action: "query_user_directory",
      resource: "Executive Payroll",
    }),
  });
  const execOutOfScopeData = await execOutOfScopeRes.json();

  record(
    "8",
    "Agent cannot use delegated permission outside the resource scope",
    "HTTP 403 Forbidden with SCOPE_MISMATCH reason",
    `HTTP ${execOutOfScopeRes.status}: ${execOutOfScopeData.reason}`,
    execOutOfScopeRes.status === 403 && execOutOfScopeData.reason === "SCOPE_MISMATCH"
  );

  // -------------------------------------------------------------
  // TEST 9: Agent cannot use another agent's delegation
  // -------------------------------------------------------------
  // Agent B attempts to query "Sales Directory" (delegation was given to Agent A)
  const agentBUseRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyB}`,
    },
    body: JSON.stringify({
      action: "query_user_directory",
      resource: "Sales Directory",
    }),
  });
  record(
    "9",
    "Agent cannot use another agent's delegation (Agent Isolation)",
    "HTTP 403 Forbidden",
    `HTTP ${agentBUseRes.status}`,
    agentBUseRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 10: Expired delegation is rejected
  // -------------------------------------------------------------
  // Create an expired delegation directly in DB for testing
  const expiredDel = await prisma.delegation.create({
    data: {
      grantorId: "cmw1yhvg3000g4hh2bmau9uqr", // Alex Vance
      agentId: agentBId,
      permissions: JSON.stringify(["users.read"]),
      scope: "Archive Directory",
      reason: "Expired testing grant",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 60000), // 1 minute in past
    },
  });

  const execExpiredRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyB}`,
    },
    body: JSON.stringify({
      action: "query_user_directory",
      resource: "Archive Directory",
    }),
  });

  // Confirm DB status was transitioned to EXPIRED
  const dbExpiredCheck = await prisma.delegation.findUnique({ where: { id: expiredDel.id } });

  record(
    "10",
    "Expired delegation is rejected and transitioned to EXPIRED",
    "HTTP 403 and status === EXPIRED in DB",
    `HTTP ${execExpiredRes.status}, DB status: ${dbExpiredCheck?.status}`,
    execExpiredRes.status === 403 && dbExpiredCheck?.status === "EXPIRED"
  );

  // -------------------------------------------------------------
  // TEST 11: Revoked delegation is rejected immediately
  // -------------------------------------------------------------
  // Revoke delegation A
  await fetch(`${BASE}/api/delegations/${delegationAId}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });

  // Agent A attempts to use revoked delegation immediately
  const execAfterRevokeRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({
      action: "query_user_directory",
      resource: "Sales Directory",
    }),
  });

  record(
    "11",
    "Revoked delegation is rejected immediately",
    "HTTP 403 Forbidden",
    `HTTP ${execAfterRevokeRes.status}`,
    execAfterRevokeRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 12: Suspended agent cannot use delegated permission
  // -------------------------------------------------------------
  // Create new active delegation for Agent A
  const delActive2 = await prisma.delegation.create({
    data: {
      grantorId: "cmw1yhvg3000g4hh2bmau9uqr",
      agentId: agentAId,
      permissions: JSON.stringify(["users.read"]),
      scope: "Global",
      reason: "Test suspended agent behavior",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Suspend Agent A
  await fetch(`${BASE}/api/agents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: agentAId, status: "SUSPENDED" }),
  });

  // Attempt execution while suspended
  const execSuspendedRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({ action: "query_user_directory" }),
  });

  // Re-activate Agent A for subsequent tests
  await fetch(`${BASE}/api/agents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: agentAId, status: "ACTIVE" }),
  });

  record(
    "12",
    "Suspended agent cannot use delegated permission",
    "HTTP 403 Forbidden (SUSPENDED)",
    `HTTP ${execSuspendedRes.status}`,
    execSuspendedRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 13: Inactive/demoted grantor cannot provide delegated authority
  // -------------------------------------------------------------
  // Create a delegation where grantor does NOT have the permission in their role
  // e.g. Taylor Brooks (Employee) only has reports.read
  const fakeGrantorDel = await prisma.delegation.create({
    data: {
      grantorId: "cmw1yhvgf000k4hh2evpj8k6f", // Taylor Brooks (Employee)
      agentId: agentAId,
      permissions: JSON.stringify(["roles.manage"]), // Taylor does NOT have roles.manage
      scope: "Security Roles",
      reason: "Simulating grantor loss of permission",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const execDemotedGrantorRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({
      action: "modify_system_roles",
      resource: "Security Roles",
    }),
  });

  record(
    "13",
    "Inactive or demoted grantor cannot provide delegated authority",
    "HTTP 403 Forbidden",
    `HTTP ${execDemotedGrantorRes.status}`,
    execDemotedGrantorRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 14: Unauthorized human cannot revoke delegation
  // -------------------------------------------------------------
  // Employee attempts to revoke delegation created by Admin (delActive2)
  const unauthRevokeRes = await fetch(`${BASE}/api/delegations/${delActive2.id}`, {
    method: "DELETE",
    headers: { Cookie: employeeCookie },
  });
  record(
    "14",
    "Unauthorized human cannot revoke delegation",
    "HTTP 403 Forbidden",
    `HTTP ${unauthRevokeRes.status}`,
    unauthRevokeRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 15: Authorized human can revoke delegation
  // -------------------------------------------------------------
  const authRevokeRes = await fetch(`${BASE}/api/delegations/${delActive2.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  const authRevokeData = await authRevokeRes.json();

  record(
    "15",
    "Authorized human can revoke delegation",
    "HTTP 200 OK with REVOKED status",
    `HTTP ${authRevokeRes.status}, status: ${authRevokeData.delegation?.status}`,
    authRevokeRes.status === 200 && authRevokeData.delegation?.status === "REVOKED"
  );

  // -------------------------------------------------------------
  // TEST 16: Delegation actions are recorded in AuditLog
  // -------------------------------------------------------------
  const delAudits = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "DELEGATION_CREATED",
          "DELEGATION_REVOKED",
          "DELEGATED_ACCESS_ALLOWED",
          "DELEGATED_ACCESS_DENIED",
          "DELEGATION_AUTHORIZATION_FAILED",
        ],
      },
    },
  });
  const actionsLogged = new Set(delAudits.map((a) => a.action));

  record(
    "16",
    "Delegation actions are recorded in AuditLog",
    "All delegation lifecycle events logged",
    `Logged: ${Array.from(actionsLogged).join(", ")}`,
    actionsLogged.has("DELEGATION_CREATED") &&
      actionsLogged.has("DELEGATION_REVOKED") &&
      actionsLogged.has("DELEGATED_ACCESS_ALLOWED") &&
      actionsLogged.has("DELEGATED_ACCESS_DENIED")
  );

  // -------------------------------------------------------------
  // TEST 17: Agent's normal RBAC permissions still work
  // -------------------------------------------------------------
  // Agent A role has "reports.read". Calls read_telemetry without any delegation!
  const normalRbacRes = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKeyA}`,
    },
    body: JSON.stringify({ action: "read_telemetry" }),
  });
  const normalRbacData = await normalRbacRes.json();

  record(
    "17",
    "Agent's normal static RBAC permissions still work",
    "HTTP 200 OK without delegation dependency",
    `HTTP ${normalRbacRes.status}, action: ${normalRbacData.executedAction}`,
    normalRbacRes.status === 200 && normalRbacData.delegationDetails === null
  );

  // -------------------------------------------------------------
  // TEST 18: Delegation cannot increase permissions beyond grantor's effective permissions
  // -------------------------------------------------------------
  // Manager Morgan Chen has reports.read/create, users.read, roles.read, agents.read, audit.read
  // Manager does NOT have "users.delete". Attempting to delegate "users.delete"
  const exceedBoundaryRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      agentId: agentAId,
      permissions: ["users.delete"],
      reason: "Manager attempting to delegate unassigned permission",
      expiresInHours: 2,
    }),
  });
  record(
    "18",
    "Delegation cannot increase permissions beyond grantor's effective permissions",
    "HTTP 403 Forbidden",
    `HTTP ${exceedBoundaryRes.status}`,
    exceedBoundaryRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 19: Client-supplied grantor identity cannot be spoofed
  // -------------------------------------------------------------
  // Employee passes body: { grantorId: adminId }
  const spoofGrantorRes = await fetch(`${BASE}/api/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({
      grantorId: "cmw1yhvg3000g4hh2bmau9uqr", // Admin ID
      agentId: agentAId,
      permissions: ["reports.read"],
      reason: "Employee attempts to spoof grantorId parameter",
      expiresInHours: 2,
    }),
  });
  const spoofGrantorData = await spoofGrantorRes.json();

  record(
    "19",
    "Client-supplied grantor identity cannot be spoofed (derived from session)",
    "Grantor is Taylor Brooks (session user), NOT Alex Vance",
    `Grantor name: ${spoofGrantorData.delegation?.grantor?.name}`,
    spoofGrantorData.delegation?.grantor?.name === "Taylor Brooks"
  );

  // -------------------------------------------------------------
  // TEST 20: Delegation records persist after database query / restart
  // -------------------------------------------------------------
  const dbPersistCheck = await prisma.delegation.findUnique({
    where: { id: delegationAId },
  });

  record(
    "20",
    "Delegation records persist reliably in SQLite database",
    "Record found in SQLite with matching ID and status REVOKED",
    `Found in DB: ${dbPersistCheck?.id}, status: ${dbPersistCheck?.status}`,
    dbPersistCheck?.id === delegationAId && dbPersistCheck?.status === "REVOKED"
  );

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log("=============================================================");
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${failed}`);
  console.log("=============================================================\n");

  await prisma.$disconnect();

  if (failed > 0) process.exit(1);
}

run().catch(async (e) => {
  console.error("Test execution failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});

