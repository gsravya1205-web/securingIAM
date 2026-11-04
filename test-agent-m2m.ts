import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function loginUser(base: string, email: string, pass: string) {
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
  console.log("🤖 =============================================================");
  console.log("🤖   SECUREID - AI AGENT IDENTITY & M2M SECURITY TEST SUITE     ");
  console.log("🤖 =============================================================\n");

  const BASE = "http://127.0.0.1:3040";
  const results: { id: string; title: string; expected: string; actual: string; pass: boolean }[] = [];

  function record(id: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // Pre-fetch cookies
  const adminCookie = await loginUser(BASE, "admin@secureid.local", "Admin123!");
  const managerCookie = await loginUser(BASE, "manager@secureid.local", "Manager123!");
  const employeeCookie = await loginUser(BASE, "employee@secureid.local", "Employee123!");

  // -----------------------------------------------------------------
  // 1. AI Agent Provisioning via POST /api/agents
  // -----------------------------------------------------------------
  const testAgentName = `TestSentinel-${Date.now()}`;
  const createAgentRes = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: testAgentName,
      description: "Automated vulnerability scanner for CI/CD pipelines",
      rateLimit: 80,
    }),
  });
  const createAgentData = await createAgentRes.json();
  const rawApiKey = createAgentData.rawApiKey;
  const createdAgentId = createAgentData.agent?.id;

  record(
    "1.1",
    "Admin creates new AI Agent Identity (POST /api/agents)",
    "HTTP 201 Created with CSPRNG secret key",
    `HTTP ${createAgentRes.status} (keyPrefix: ${rawApiKey?.substring(0, 10)})`,
    createAgentRes.status === 201 && rawApiKey?.startsWith("sec_agent_")
  );

  // Employee attempting to register agent
  const empCreateAgent = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({ name: "Illegal-Agent", description: "Breach attempt" }),
  });
  record(
    "1.2",
    "Employee blocked from registering agent (lacks agents.manage)",
    "HTTP 403 Forbidden",
    `HTTP ${empCreateAgent.status}`,
    empCreateAgent.status === 403
  );

  // -----------------------------------------------------------------
  // 2. Machine-to-Machine (M2M) Bearer Authentication via Runtime Gateway
  // -----------------------------------------------------------------
  // 2.1 Unauthenticated M2M call
  const unauthM2M = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "read_agent_telemetry" }),
  });
  record(
    "2.1",
    "Unauthenticated M2M call rejected without Bearer token",
    "HTTP 401 Unauthorized",
    `HTTP ${unauthM2M.status}`,
    unauthM2M.status === 401
  );

  // 2.2 Malformed Bearer token
  const badTokenM2M = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid_non_prefixed_token",
    },
    body: JSON.stringify({ action: "read_agent_telemetry" }),
  });
  record(
    "2.2",
    "M2M call rejected with malformed token (missing sec_agent_)",
    "HTTP 401 Unauthorized",
    `HTTP ${badTokenM2M.status}`,
    badTokenM2M.status === 401
  );

  // 2.3 Valid M2M execution with the newly generated agent key
  const validM2M = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawApiKey}`,
    },
    body: JSON.stringify({ action: "read_agent_telemetry" }),
  });
  const validM2MData = await validM2M.json();
  record(
    "2.3",
    "Autonomous Agent executes tool with valid Bearer credential",
    "HTTP 200 OK with runtime telemetry",
    `HTTP ${validM2M.status} (Agent: ${validM2MData.agentName})`,
    validM2M.status === 200 && validM2MData.success === true
  );

  // 2.4 Least-Privilege enforcement: Agent attempting out-of-scope human action
  const outOfScopeM2M = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawApiKey}`,
    },
    body: JSON.stringify({ action: "query_user_directory" }),
  });
  record(
    "2.4",
    "Agent blocked from out-of-scope user directory (Least-Privilege)",
    "HTTP 403 Forbidden (RBAC Violation)",
    `HTTP ${outOfScopeM2M.status}`,
    outOfScopeM2M.status === 403
  );

  // -----------------------------------------------------------------
  // 3. Key Rotation & Lifecycle Revocation
  // -----------------------------------------------------------------
  // 3.1 Rotate Key
  const rotateRes = await fetch(`${BASE}/api/agents/rotate-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ agentId: createdAgentId }),
  });
  const rotateData = await rotateRes.json();
  const rotatedKey = rotateData.newSecretKey;
  record(
    "3.1",
    "Admin rotates agent API key (POST /api/agents/rotate-key)",
    "HTTP 200 OK with new high-entropy machine token",
    `HTTP ${rotateRes.status} (New key: ${rotatedKey?.substring(0, 10)})`,
    rotateRes.status === 200 && rotatedKey?.startsWith("sec_agent_") && rotatedKey !== rawApiKey
  );

  // 3.2 Old key must now be invalid!
  const oldKeyAttempt = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawApiKey}`,
    },
    body: JSON.stringify({ action: "read_agent_telemetry" }),
  });
  record(
    "3.2",
    "Old revoked key is rejected after rotation",
    "HTTP 401 Unauthorized",
    `HTTP ${oldKeyAttempt.status}`,
    oldKeyAttempt.status === 401
  );

  // 3.3 New key operates successfully!
  const newKeyAttempt = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rotatedKey}`,
    },
    body: JSON.stringify({ action: "generate_compliance_summary" }),
  });
  record(
    "3.3",
    "New rotated key successfully authenticates machine execution",
    "HTTP 200 OK",
    `HTTP ${newKeyAttempt.status}`,
    newKeyAttempt.status === 200
  );

  // -----------------------------------------------------------------
  // 4. Operational Status Lifecycle (Suspension & Reinstatement)
  // -----------------------------------------------------------------
  // 4.1 Suspend agent
  await fetch(`${BASE}/api/agents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: createdAgentId, status: "SUSPENDED" }),
  });

  const suspendedAttempt = await fetch(`${BASE}/api/agent-runtime/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rotatedKey}`,
    },
    body: JSON.stringify({ action: "generate_compliance_summary" }),
  });
  record(
    "4.1",
    "Suspended machine identity blocked from execution",
    "HTTP 403 Forbidden (SUSPENDED)",
    `HTTP ${suspendedAttempt.status}`,
    suspendedAttempt.status === 403
  );

  // -----------------------------------------------------------------
  // 5. Human-in-the-Loop Approval Queue (Dual-Control)
  // -----------------------------------------------------------------
  // 5.1 Submit approval request
  const submitAppr = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requesterName: testAgentName,
      requesterType: "AGENT",
      requestedAction: "DATABASE_BACKUP_EXPORT",
      resource: "Database:dev.db",
      reason: "Quarterly archival replication",
    }),
  });
  const apprData = await submitAppr.json();
  const apprId = apprData.approval?.id;
  record(
    "5.1",
    "Agent queues high-risk request in human approval queue",
    "HTTP 201 Created",
    `HTTP ${submitAppr.status}`,
    submitAppr.status === 201
  );

  // 5.2 Employee tries to render verdict -> blocked
  const empVerdict = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({ id: apprId, decision: "APPROVED" }),
  });
  record(
    "5.2",
    "Employee blocked from rendering approval verdict",
    "HTTP 403 Forbidden",
    `HTTP ${empVerdict.status}`,
    empVerdict.status === 403
  );

  // 5.3 Admin approves verdict -> succeeds
  const adminVerdict = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: apprId, decision: "APPROVED" }),
  });
  record(
    "5.3",
    "Admin supervisor renders APPROVED verdict with audit record",
    "HTTP 200 OK",
    `HTTP ${adminVerdict.status}`,
    adminVerdict.status === 200
  );

  // -----------------------------------------------------------------
  // 6. Emergency Kill-Switch Circuit-Breaker
  // -----------------------------------------------------------------
  const killSwitchRes = await fetch(`${BASE}/api/monitoring/kill-switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ action: "ACTIVATE" }),
  });
  const killData = await killSwitchRes.json();
  record(
    "6.1",
    "Admin activates Emergency Kill-Switch across all agent gateways",
    "HTTP 200 OK with suspended count",
    `HTTP ${killSwitchRes.status} (Suspended: ${killData.suspendedCount})`,
    killSwitchRes.status === 200 && killData.action === "ACTIVATED"
  );

  // Deactivate Kill-Switch to restore healthy state
  await fetch(`${BASE}/api/monitoring/kill-switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ action: "DEACTIVATE" }),
  });

  // Verify Audit Log records
  const recentLogs = await prisma.auditLog.findMany({
    where: { actorType: "AGENT" },
    take: 5,
    orderBy: { timestamp: "desc" },
  });
  record(
    "6.2",
    "Immutable Audit Log records machine events (actorType: AGENT)",
    "Audit entries with actorType AGENT present",
    recentLogs.length > 0 ? `Found ${recentLogs.length} machine audit logs` : "None found",
    recentLogs.length > 0
  );

  await prisma.$disconnect();

  const allPassed = results.every((r) => r.pass);
  console.log("=============================================================");
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.pass).length} | FAILED: ${results.filter((r) => !r.pass).length}`);
  console.log(`OVERALL AI AGENT & M2M STATUS: ${allPassed ? "✅ ALL CHECKS PASSED" : "❌ FAILURES DETECTED"}`);
  console.log("=============================================================");

  if (!allPassed) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

