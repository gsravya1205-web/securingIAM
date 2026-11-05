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
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`No cookie for ${email}`);
  return cookie.split(";")[0];
}

async function run() {
  console.log("🛡️ =============================================================");
  console.log("🛡️   SECUREID - PHASE 2: APPROVAL MANAGEMENT TEST SUITE        ");
  console.log("🛡️ =============================================================\n");

  // 1. Authenticate test users
  const adminCookie = await loginUser("admin@secureid.local", "Admin123!");
  const managerCookie = await loginUser("manager@secureid.local", "Manager123!");
  const employeeCookie = await loginUser("employee@secureid.local", "Employee123!");

  // Provision or get an active test agent with raw API key
  const agentName = `TestApprovalAgent-${Date.now()}`;
  const createAgentRes = await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: agentName,
      description: "Autonomous agent for approval integration test",
      rateLimit: 60,
    }),
  });
  const agentData = await createAgentRes.json();
  const rawApiKey = agentData.rawApiKey;
  const agentId = agentData.agent.id;

  // -------------------------------------------------------------
  // TEST 1: Unauthenticated access to /api/approvals is rejected
  // -------------------------------------------------------------
  const unauthGet = await fetch(`${BASE}/api/approvals`);
  record(
    "1.1",
    "Unauthenticated GET /api/approvals rejected",
    "HTTP 401",
    `HTTP ${unauthGet.status}`,
    unauthGet.status === 401
  );

  const unauthPost = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetAction: "reports.create",
      resource: "Reports:Security",
      justification: "Unauthenticated test",
    }),
  });
  record(
    "1.2",
    "Unauthenticated POST /api/approvals rejected",
    "HTTP 401",
    `HTTP ${unauthPost.status}`,
    unauthPost.status === 401
  );

  // -------------------------------------------------------------
  // TEST 2: Human User creates approval request
  // -------------------------------------------------------------
  const userCreateRes = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      targetAction: "privilege.elevation",
      resource: "Production:DatabaseCluster",
      justification: "Emergency maintenance window for index rebuild",
      expiresInHours: 4,
    }),
  });
  const userCreateData = await userCreateRes.json();
  const userApprovalId = userCreateData.approval?.id;

  record(
    "2.1",
    "Manager creates approval request via session",
    "HTTP 201 with status PENDING and requesterType USER",
    `HTTP ${userCreateRes.status}, status: ${userCreateData.approval?.status}, type: ${userCreateData.approval?.requesterType}`,
    userCreateRes.status === 201 &&
      userCreateData.approval?.status === "PENDING" &&
      userCreateData.approval?.requesterType === "USER" &&
      userCreateData.approval?.requesterName === "Morgan Chen"
  );

  // Verify persistence in SQLite
  const dbUserReq = await prisma.approvalRequest.findUnique({
    where: { id: userApprovalId },
  });
  record(
    "2.2",
    "Approval request persistently stored in SQLite",
    "Found in database with matching ID",
    dbUserReq ? `Found in DB: ${dbUserReq.id}` : "Not found in DB",
    Boolean(dbUserReq && dbUserReq.id === userApprovalId)
  );

  // -------------------------------------------------------------
  // TEST 3: Machine Agent creates approval request via Bearer Key
  // -------------------------------------------------------------
  const agentCreateRes = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawApiKey}`,
    },
    body: JSON.stringify({
      targetAction: "reports.create",
      resource: "Compliance:QuarterlyAudit",
      justification: "Autonomous ISO-27001 evidence report generation",
      expiresInHours: 12,
    }),
  });
  const agentCreateData = await agentCreateRes.json();
  const agentApprovalId = agentCreateData.approval?.id;

  record(
    "3.1",
    "AI Agent creates approval request via Bearer Token",
    "HTTP 201 with status PENDING and requesterType AGENT",
    `HTTP ${agentCreateRes.status}, status: ${agentCreateData.approval?.status}, type: ${agentCreateData.approval?.requesterType}`,
    agentCreateRes.status === 201 &&
      agentCreateData.approval?.status === "PENDING" &&
      agentCreateData.approval?.requesterType === "AGENT" &&
      agentCreateData.approval?.requesterName === agentName
  );

  // -------------------------------------------------------------
  // TEST 4: Client cannot forge requester identity
  // -------------------------------------------------------------
  const spoofRes = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({
      requesterType: "AGENT",
      requesterId: "fake-admin-id",
      requesterName: "Alex Vance",
      targetAction: "users.delete",
      resource: "Users:All",
      justification: "Attempting identity spoofing",
    }),
  });
  const spoofData = await spoofRes.json();
  record(
    "4.1",
    "Server derives identity strictly from verified session (ignores forged fields)",
    "Derived requesterName: Taylor Brooks, requesterType: USER",
    `Derived requesterName: ${spoofData.approval?.requesterName}, requesterType: ${spoofData.approval?.requesterType}`,
    spoofData.approval?.requesterName === "Taylor Brooks" &&
      spoofData.approval?.requesterType === "USER"
  );

  // -------------------------------------------------------------
  // TEST 5: Separation of Duties (Self-approval is strictly blocked)
  // -------------------------------------------------------------
  // Manager Morgan Chen created userApprovalId. Morgan Chen attempts to approve it.
  const selfApproveRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      id: userApprovalId,
      decision: "APPROVED",
      reviewerNote: "Self-approving my own elevation",
    }),
  });
  const selfApproveData = await selfApproveRes.json();

  record(
    "5.1",
    "Separation of Duties: Requester blocked from approving their own request",
    "HTTP 403 Forbidden with SoD error",
    `HTTP ${selfApproveRes.status}: ${selfApproveData.error}`,
    selfApproveRes.status === 403 &&
      selfApproveData.error?.includes("Separation of Duties")
  );

  // Verify self-approval rejection was logged in AuditLog
  const sodAudit = await prisma.auditLog.findFirst({
    where: {
      action: "APPROVAL_SELF_REVIEW_REJECTED",
      resource: `ApprovalRequest:${userApprovalId}`,
    },
  });
  record(
    "5.2",
    "SoD violation recorded in immutable AuditLog",
    "APPROVAL_SELF_REVIEW_REJECTED audit record found",
    sodAudit ? `Found: ${sodAudit.action} - ${sodAudit.details}` : "Audit record not found",
    Boolean(sodAudit)
  );

  // -------------------------------------------------------------
  // TEST 6: Unauthorized user cannot review requests
  // -------------------------------------------------------------
  // Employee Taylor Brooks attempts to approve the Agent's request
  const employeeReviewRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({
      id: agentApprovalId,
      decision: "APPROVED",
    }),
  });
  record(
    "6.1",
    "Employee lacks governance authority to review approval requests",
    "HTTP 403 Forbidden",
    `HTTP ${employeeReviewRes.status}`,
    employeeReviewRes.status === 403
  );

  // -------------------------------------------------------------
  // TEST 7: Authorized Admin approves Manager's request
  // -------------------------------------------------------------
  // Admin Alex Vance approves Morgan Chen's request
  const adminApproveRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      id: userApprovalId,
      decision: "APPROVED",
      reviewerNote: "Approved after verifying maintenance change ticket CHG-4021.",
    }),
  });
  const adminApproveData = await adminApproveRes.json();

  record(
    "7.1",
    "Authorized Admin approves Manager request (Dual Control satisfied)",
    "HTTP 200 with status APPROVED and reviewer info",
    `HTTP ${adminApproveRes.status}, status: ${adminApproveData.approval?.status}, reviewer: ${adminApproveData.approval?.reviewer?.name}`,
    adminApproveRes.status === 200 &&
      adminApproveData.approval?.status === "APPROVED" &&
      adminApproveData.approval?.reviewer?.name === "Alex Vance"
  );

  // -------------------------------------------------------------
  // TEST 8: Conflict / Duplicate resolution prevention
  // -------------------------------------------------------------
  // Attempting to approve the already-approved request again
  const duplicateRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      id: userApprovalId,
      decision: "REJECTED",
    }),
  });
  record(
    "8.1",
    "Resolving already-resolved request rejected with 409 Conflict",
    "HTTP 409 Conflict",
    `HTTP ${duplicateRes.status}`,
    duplicateRes.status === 409
  );

  // -------------------------------------------------------------
  // TEST 9: Authorized Supervisor rejects Agent request
  // -------------------------------------------------------------
  // Manager Morgan Chen rejects agentApprovalId
  const managerRejectRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      id: agentApprovalId,
      decision: "REJECTED",
      reviewerNote: "Scope too broad for autonomous generation; narrow to public metrics.",
    }),
  });
  const managerRejectData = await managerRejectRes.json();

  record(
    "9.1",
    "Authorized Supervisor rejects agent request",
    "HTTP 200 with status REJECTED and reviewer info",
    `HTTP ${managerRejectRes.status}, status: ${managerRejectData.approval?.status}, reviewer: ${managerRejectData.approval?.reviewer?.name}`,
    managerRejectRes.status === 200 &&
      managerRejectData.approval?.status === "REJECTED" &&
      managerRejectData.approval?.reviewer?.name === "Morgan Chen"
  );

  // -------------------------------------------------------------
  // TEST 10: Expired requests cannot be approved
  // -------------------------------------------------------------
  // Create an already-expired request directly in DB for testing
  const expiredReq = await prisma.approvalRequest.create({
    data: {
      requesterType: "AGENT",
      requesterId: agentId,
      requesterName: agentName,
      targetAction: "reports.create",
      resource: "Reports:ExpiredTarget",
      justification: "Test request that expired prior to review",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    },
  });

  const reviewExpiredRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      id: expiredReq.id,
      decision: "APPROVED",
    }),
  });
  const reviewExpiredData = await reviewExpiredRes.json();

  record(
    "10.1",
    "Expired approval request cannot be approved",
    "HTTP 400 with expiration error",
    `HTTP ${reviewExpiredRes.status}: ${reviewExpiredData.error}`,
    reviewExpiredRes.status === 400 &&
      reviewExpiredData.error?.includes("expired")
  );

  // Verify status in DB was set to EXPIRED
  const dbExpiredCheck = await prisma.approvalRequest.findUnique({
    where: { id: expiredReq.id },
  });
  record(
    "10.2",
    "Expired request transitioned to EXPIRED status in SQLite",
    "status === EXPIRED",
    `status: ${dbExpiredCheck?.status}`,
    dbExpiredCheck?.status === "EXPIRED"
  );

  // -------------------------------------------------------------
  // TEST 11: RESTful Dynamic Route /api/approvals/[id]
  // -------------------------------------------------------------
  const restGetRes = await fetch(`${BASE}/api/approvals/${userApprovalId}`, {
    headers: { Cookie: adminCookie },
  });
  const restGetData = await restGetRes.json();
  record(
    "11.1",
    "GET /api/approvals/[id] returns detailed approval with reviewer",
    "HTTP 200 with matching approval id",
    `HTTP ${restGetRes.status}, id: ${restGetData.approval?.id}`,
    restGetRes.status === 200 && restGetData.approval?.id === userApprovalId
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

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(async (e) => {
  console.error("Test execution failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});

