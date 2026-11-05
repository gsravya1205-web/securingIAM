import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3040";

interface CheckItem {
  id: string;
  category: string;
  description: string;
  result: "PASS" | "FAIL";
  details: string;
}

const checks: CheckItem[] = [];

function recordCheck(id: string, category: string, description: string, pass: boolean, details: string) {
  checks.push({
    id,
    category,
    description,
    result: pass ? "PASS" : "FAIL",
    details,
  });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id}: ${description}`);
  console.log(`       Details: ${details}\n`);
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

async function main() {
  console.log("=============================================================");
  console.log("  SECUREID PART 2 - PHASE 2: FINAL COMPREHENSIVE VERIFICATION");
  console.log("=============================================================\n");

  const adminCookie = await loginUser("admin@secureid.local", "Admin123!");
  const managerCookie = await loginUser("manager@secureid.local", "Manager123!");
  const employeeCookie = await loginUser("employee@secureid.local", "Employee123!");

  // Get active agent API key
  const activeAgent = await prisma.agent.findFirst({ where: { status: "ACTIVE" } });
  if (!activeAgent) throw new Error("No active agent in DB");

  // Rotate or create an agent key to obtain a valid plaintext key
  const rotateRes = await fetch(`${BASE}/api/agents/rotate-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: activeAgent.id }),
  });
  const rotateData = await rotateRes.json();
  const rawAgentKey = rotateData.rawApiKey;

  // -------------------------------------------------------------------------
  // CHECK 1: AI Agent cannot access human supervisory review endpoints
  // -------------------------------------------------------------------------
  // Create a pending request
  const testReq1 = await prisma.approvalRequest.create({
    data: {
      requesterType: "USER",
      requesterId: "test-user-id",
      requesterName: "Test User",
      targetAction: "reports.create",
      resource: "Resource:AgentBlockedTest",
      justification: "Testing agent blockage on review endpoints",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });

  const agentReviewAttempt = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawAgentKey}`,
    },
    body: JSON.stringify({ id: testReq1.id, decision: "APPROVED" }),
  });
  const agentReviewData = await agentReviewAttempt.json();

  recordCheck(
    "SEC-01",
    "Machine Boundary",
    "AI Agent calling supervisory review endpoint (PATCH /api/approvals) is rejected",
    agentReviewAttempt.status === 401,
    `HTTP ${agentReviewAttempt.status} - ${agentReviewData.error}`
  );

  // Dynamic route check
  const agentDynamicReviewAttempt = await fetch(`${BASE}/api/approvals/${testReq1.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawAgentKey}`,
    },
    body: JSON.stringify({ decision: "APPROVED" }),
  });
  const agentDynamicData = await agentDynamicReviewAttempt.json();

  recordCheck(
    "SEC-02",
    "Machine Boundary",
    "AI Agent calling dynamic supervisory review endpoint (PATCH /api/approvals/[id]) is rejected",
    agentDynamicReviewAttempt.status === 401,
    `HTTP ${agentDynamicReviewAttempt.status} - ${agentDynamicData.error}`
  );

  // -------------------------------------------------------------------------
  // CHECK 2: Separation of Duties (Self-approval blocked)
  // -------------------------------------------------------------------------
  // Manager Morgan Chen creates request
  const managerCreateRes = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({
      targetAction: "roles.manage",
      resource: "Roles:AdminAccess",
      justification: "Testing SoD enforcement",
    }),
  });
  const managerCreateData = await managerCreateRes.json();
  const managerReqId = managerCreateData.approval.id;

  // Manager Morgan Chen attempts to approve own request
  const managerSelfApprove = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: managerCookie },
    body: JSON.stringify({ id: managerReqId, decision: "APPROVED" }),
  });
  const managerSelfData = await managerSelfApprove.json();

  recordCheck(
    "SEC-03",
    "Separation of Duties",
    "Requester user is strictly prohibited from approving their own request",
    managerSelfApprove.status === 403 && managerSelfData.error.includes("Separation of Duties"),
    `HTTP ${managerSelfApprove.status} - ${managerSelfData.error}`
  );

  // -------------------------------------------------------------------------
  // CHECK 3: Unauthorized user access to organization-wide records
  // -------------------------------------------------------------------------
  // Employee requests approval queue
  const empListRes = await fetch(`${BASE}/api/approvals`, {
    headers: { Cookie: employeeCookie },
  });
  const empListData = await empListRes.json();

  // Confirm employee does NOT see manager's request or agent requests
  const hasForeign = empListData.approvals.some(
    (a: { requesterType: string; requesterName: string }) =>
      a.requesterName === "Morgan Chen" || a.requesterType === "AGENT"
  );

  recordCheck(
    "SEC-04",
    "Least Privilege & Visibility",
    "Unauthorized employee cannot view organization-wide or agent approval records",
    empListRes.status === 200 && !hasForeign,
    `Total visible to employee: ${empListData.approvals.length}. Contains foreign requests: ${hasForeign}`
  );

  // Employee attempts to inspect foreign request directly via /api/approvals/[id]
  const empDirectRes = await fetch(`${BASE}/api/approvals/${managerReqId}`, {
    headers: { Cookie: employeeCookie },
  });
  const empDirectData = await empDirectRes.json();

  recordCheck(
    "SEC-05",
    "Least Privilege & Visibility",
    "Unauthorized employee cannot view specific foreign approval record via GET /api/approvals/[id]",
    empDirectRes.status === 403,
    `HTTP ${empDirectRes.status} - ${empDirectData.error}`
  );

  // -------------------------------------------------------------------------
  // CHECK 4: Expired requests cannot be approved
  // -------------------------------------------------------------------------
  const expiredTicket = await prisma.approvalRequest.create({
    data: {
      requesterType: "USER",
      requesterId: "test-user-id",
      requesterName: "Test User",
      targetAction: "reports.create",
      resource: "Resource:ExpiredVerification",
      justification: "Verifying expiration enforcement",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 5000), // 5 seconds in past
    },
  });

  const approveExpiredRes = await fetch(`${BASE}/api/approvals`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: expiredTicket.id, decision: "APPROVED" }),
  });
  const approveExpiredData = await approveExpiredRes.json();

  recordCheck(
    "SEC-06",
    "Temporal Boundary",
    "Expired approval request cannot be approved by administrator",
    approveExpiredRes.status === 400 && approveExpiredData.error.includes("expired"),
    `HTTP ${approveExpiredRes.status} - ${approveExpiredData.error}`
  );

  // -------------------------------------------------------------------------
  // CHECK 5: Concurrency - Two simultaneous reviewers cannot resolve twice
  // -------------------------------------------------------------------------
  const raceTicket = await prisma.approvalRequest.create({
    data: {
      requesterType: "AGENT",
      requesterId: activeAgent.id,
      requesterName: activeAgent.name,
      targetAction: "reports.create",
      resource: "Resource:RaceConditionVerification",
      justification: "Atomic race condition verification",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });

  const [race1, race2] = await Promise.all([
    fetch(`${BASE}/api/approvals`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ id: raceTicket.id, decision: "APPROVED", reviewerNote: "Admin vote" }),
    }),
    fetch(`${BASE}/api/approvals`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ id: raceTicket.id, decision: "REJECTED", reviewerNote: "Manager vote" }),
    }),
  ]);

  const raceStatuses = [race1.status, race2.status];
  const racePass = raceStatuses.includes(200) && raceStatuses.includes(409);

  recordCheck(
    "SEC-07",
    "Atomic Concurrency",
    "Two simultaneous reviewers cannot double-resolve the same request (atomic conditional update)",
    racePass,
    `Statuses: ${raceStatuses.join(", ")} (One 200 OK, One 409 Conflict)`
  );

  // -------------------------------------------------------------------------
  // CHECK 6: Server-side identity derivation (No spoofing)
  // -------------------------------------------------------------------------
  const spoofAttempt = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    body: JSON.stringify({
      requesterType: "AGENT",
      requesterId: "impersonated-agent-id",
      requesterName: "Root-Admin-Bot",
      targetAction: "reports.create",
      resource: "Reports:Classified",
      justification: "Client attempts to supply fake identity parameters",
    }),
  });
  const spoofData = await spoofAttempt.json();

  recordCheck(
    "SEC-08",
    "Identity Integrity",
    "Approval request derives identity exclusively from authenticated session (ignores client spoofing)",
    spoofData.approval.requesterName === "Taylor Brooks" && spoofData.approval.requesterType === "USER",
    `Saved requesterName: '${spoofData.approval.requesterName}', requesterType: '${spoofData.approval.requesterType}'`
  );

  // -------------------------------------------------------------------------
  // CHECK 7: Sensitive Information Leakage in Error Responses
  // -------------------------------------------------------------------------
  const malformedReq = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: "{ malformed json",
  });
  const malformedText = await malformedReq.text();

  const noLeak =
    !malformedText.includes("at ") &&
    !malformedText.includes("node_modules") &&
    !malformedText.includes("passwordHash") &&
    !malformedText.includes("apiKeyHash");

  recordCheck(
    "SEC-09",
    "Error Sanitization",
    "Malformed requests and errors return sanitized messages without leaking stack traces or hashes",
    malformedReq.status >= 400 && noLeak,
    `HTTP ${malformedReq.status} - Content: ${malformedText.substring(0, 80)}...`
  );

  // -------------------------------------------------------------------------
  // CHECK 8: Audit Logging
  // -------------------------------------------------------------------------
  const auditEntries = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "APPROVAL_REQUEST_CREATED",
          "APPROVAL_DECISION_APPROVED",
          "APPROVAL_DECISION_REJECTED",
          "APPROVAL_SELF_REVIEW_REJECTED",
          "APPROVAL_REVIEW_EXPIRED",
        ],
      },
    },
    take: 10,
    orderBy: { timestamp: "desc" },
  });

  const actionsFound = new Set(auditEntries.map((a) => a.action));
  const hasExpectedActions =
    actionsFound.has("APPROVAL_REQUEST_CREATED") &&
    actionsFound.has("APPROVAL_DECISION_APPROVED") &&
    actionsFound.has("APPROVAL_SELF_REVIEW_REJECTED");

  recordCheck(
    "SEC-10",
    "Audit Trail",
    "Audit log records approval events (creation, decisions, SoD rejections, expirations)",
    hasExpectedActions,
    `Logged actions found in SQLite AuditLog: ${Array.from(actionsFound).join(", ")}`
  );

  console.log("=============================================================");
  const total = checks.length;
  const passed = checks.filter((c) => c.result === "PASS").length;
  const failed = total - passed;
  console.log(`TOTAL CHECKS: ${total}`);
  console.log(`PASSED:       ${passed}`);
  console.log(`FAILED:       ${failed}`);
  console.log("=============================================================\n");

  await prisma.$disconnect();

  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("Verification execution failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
