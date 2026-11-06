import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3040";

async function loginUser(base: string, email: string, pass: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email}: ${text}`);
  }
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`No cookie for ${email}`);
  return cookie.split(";")[0];
}

async function run() {
  console.log("🎫 =============================================================");
  console.log("🎫   SECUREID - STEP 2: AUTOMATIC APPROVAL TICKET GENERATION    ");
  console.log("🎫 =============================================================\n");

  const results: { id: string; title: string; expected: string; actual: string; pass: boolean }[] = [];

  function record(id: string, title: string, expected: string, actual: string, pass: boolean) {
    results.push({ id, title, expected, actual, pass });
    const mark = pass ? "✅ PASS" : "❌ FAIL";
    console.log(`[Test ${id}] ${title}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    console.log(`   Status:   ${mark}\n`);
  }

  // 1. Get Admin Supervisor Cookie (Gayatri or Alex Vance)
  const adminCookie = await loginUser(BASE, "gayatri@gmail.com", "123");

  // 2. Provision a dedicated ephemeral agent for this test run
  const role = await prisma.role.findUnique({
    where: { name: "AI Agent" },
  });
  if (!role) throw new Error("AI Agent role not found");

  const rawKey = `sec_agent_${crypto.randomBytes(24).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(rawKey, 10);

  const testAgent = await prisma.agent.create({
    data: {
      name: `Step2-Agent-${Date.now()}`,
      description: "Ephemeral agent for automatic approval generation testing",
      apiKeyHash,
      status: "ACTIVE",
      rateLimit: 100,
      roleId: role.id,
    },
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Sensitive action creates a pending approval ticket
    // -------------------------------------------------------------
    // Agent attempts to read high-risk Sensitive Financial Reports
    const req1 = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const data1 = await req1.json();
    const generatedTicketId = data1.approvalId;

    // Verify ticket exists in SQLite
    const ticketInDb = generatedTicketId
      ? await prisma.approvalRequest.findUnique({ where: { id: generatedTicketId } })
      : null;

    record(
      "1",
      "Sensitive action creates a pending approval ticket",
      "HTTP 403, verdict='APPROVAL_REQUIRED', ticket created with status PENDING",
      `HTTP ${req1.status}, verdict=${data1.verdict}, ticketId=${generatedTicketId}, dbStatus=${ticketInDb?.status}`,
      req1.status === 403 &&
        data1.verdict === "APPROVAL_REQUIRED" &&
        Boolean(generatedTicketId) &&
        ticketInDb !== null &&
        ticketInDb.status === "PENDING" &&
        ticketInDb.requesterType === "AGENT" &&
        ticketInDb.requesterId === testAgent.id &&
        ticketInDb.resource === "Reports:SensitiveFinancial"
    );

    // -------------------------------------------------------------
    // Test 2: Pending requests cannot execute
    // -------------------------------------------------------------
    // While the ticket is still PENDING, attempting to access financial reports must be blocked!
    const req2 = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const data2 = await req2.json();

    record(
      "2",
      "Pending requests cannot execute",
      "HTTP 403, data payload NOT returned",
      `HTTP ${req2.status}, hasData=${Boolean(data2.data)}, verdict=${data2.verdict}`,
      req2.status === 403 && !data2.data && data2.verdict === "APPROVAL_REQUIRED"
    );

    // -------------------------------------------------------------
    // Test 7: Duplicate requests are handled safely (idempotency check)
    // -------------------------------------------------------------
    // While pending, calling the same resource again should reuse the existing ticket, not duplicate it
    record(
      "7",
      "Duplicate requests are handled safely (reuses pending ticket)",
      `approvalId=${generatedTicketId}, isNewTicket=false`,
      `approvalId=${data2.approvalId}, isNewTicket=${data2.isNewTicket}`,
      data2.approvalId === generatedTicketId && data2.isNewTicket === false
    );

    // -------------------------------------------------------------
    // Test 3: Authorized human can approve a request
    // -------------------------------------------------------------
    const approveRes = await fetch(`${BASE}/api/approvals/${generatedTicketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        action: "APPROVED",
        reviewerNote: "Approved by Admin for FY2026 treasury reconciliation",
      }),
    });
    const approveData = await approveRes.json();
    const updatedTicket = await prisma.approvalRequest.findUnique({
      where: { id: generatedTicketId },
    });

    record(
      "3",
      "Authorized human can approve a request",
      "HTTP 200, status updated to APPROVED in DB",
      `HTTP ${approveRes.status}, dbStatus=${updatedTicket?.status}, reviewerId=${updatedTicket?.reviewerId}`,
      approveRes.status === 200 && updatedTicket?.status === "APPROVED" && Boolean(updatedTicket?.reviewerId)
    );

    // -------------------------------------------------------------
    // Test 5: Approved requests are re-evaluated and execute successfully
    // -------------------------------------------------------------
    const execAfterApproval = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const execData = await execAfterApproval.json();

    record(
      "5",
      "Approved requests are re-evaluated and execute successfully",
      "HTTP 200, financial report payload returned",
      `HTTP ${execAfterApproval.status}, reportId=${execData.data?.reportId}, treasuryBalance=${execData.data?.treasuryBalance}`,
      execAfterApproval.status === 200 && Boolean(execData.data?.reportId)
    );

    // -------------------------------------------------------------
    // Test 6: Expired or revoked credentials cannot execute an approved request
    // -------------------------------------------------------------
    // 6A: Rotate the agent's key so the old key is now revoked
    const rotateRes = await fetch(`${BASE}/api/agents/rotate-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ agentId: testAgent.id }),
    });
    const rotateData = await rotateRes.json();
    const newKey = rotateData.newSecretKey;

    // Attempting to execute with old key must fail with 401 even though the approval is APPROVED!
    const oldKeyExec = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });

    record(
      "6A",
      "Revoked credentials cannot execute an approved request",
      "HTTP 401 Unauthorized",
      `HTTP ${oldKeyExec.status}`,
      oldKeyExec.status === 401
    );

    // 6B: Suspended agent identity cannot execute even with valid new key and approved ticket!
    await prisma.agent.update({
      where: { id: testAgent.id },
      data: { status: "SUSPENDED" },
    });
    const suspendedExec = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${newKey}` },
    });

    record(
      "6B",
      "Suspended agent cannot execute an approved request",
      "HTTP 403 Forbidden",
      `HTTP ${suspendedExec.status}`,
      suspendedExec.status === 403
    );
    // Restore status to ACTIVE
    await prisma.agent.update({
      where: { id: testAgent.id },
      data: { status: "ACTIVE" },
    });

    // -------------------------------------------------------------
    // Test 4: Rejected requests cannot execute
    // -------------------------------------------------------------
    // Create a new request ticket and explicitly reject it
    const reqForReject = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${newKey}` },
    });
    // Wait: because previous ticket was for old agent run, let's see if new ticket is created
    // Delete the previous APPROVED ticket so a new one is generated
    await prisma.approvalRequest.delete({ where: { id: generatedTicketId } });

    const req3 = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${newKey}` },
    });
    const data3 = await req3.json();
    const rejectTicketId = data3.approvalId;

    // Supervisor REJECTS this ticket
    const rejectRes = await fetch(`${BASE}/api/approvals/${rejectTicketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        action: "REJECTED",
        reviewerNote: "Access rejected: High-risk treasury data not permitted for this agent task.",
      }),
    });
    const rejectedTicketInDb = await prisma.approvalRequest.findUnique({
      where: { id: rejectTicketId },
    });

    // Now agent attempts to execute again -> must be DENIED / blocked!
    const execAfterReject = await fetch(`${BASE}/api/resources/financial-reports`, {
      headers: { Authorization: `Bearer ${newKey}` },
    });
    const execRejectData = await execAfterReject.json();

    record(
      "4",
      "Rejected requests cannot execute",
      "HTTP 403 Forbidden, execution blocked",
      `HTTP ${execAfterReject.status}, rejectedTicketStatus=${rejectedTicketInDb?.status}`,
      execAfterReject.status === 403 &&
        rejectedTicketInDb?.status === "REJECTED" &&
        !execRejectData.data
    );

    // -------------------------------------------------------------
    // Test 8: Approval activities appear in the audit log
    // -------------------------------------------------------------
    const auditRecords = await prisma.auditLog.findMany({
      where: {
        OR: [
          { agentId: testAgent.id },
          { resource: "Reports:SensitiveFinancial" },
          { resource: `ApprovalRequest:${generatedTicketId}` },
        ],
      },
      orderBy: { timestamp: "desc" },
    });

    const hasCreatedLog = auditRecords.some((a) => a.action === "APPROVAL_REQUEST_CREATED");
    const hasApprovalRequiredLog = auditRecords.some((a) => a.action === "APPROVAL_REQUIRED");
    const hasDecisionLog = auditRecords.some((a) => a.action.startsWith("APPROVAL_DECISION_"));

    record(
      "8",
      "Approval activities appear in the audit log",
      "Logs contain APPROVAL_REQUEST_CREATED, APPROVAL_REQUIRED, and APPROVAL_DECISION_RENDERED",
      `created=${hasCreatedLog}, required=${hasApprovalRequiredLog}, decision=${hasDecisionLog}`,
      hasCreatedLog && hasApprovalRequiredLog && hasDecisionLog
    );

  } finally {
    // Clean up test agent and its approval tickets
    await prisma.approvalRequest.deleteMany({ where: { requesterId: testAgent.id } }).catch(() => {});
    await prisma.agent.delete({ where: { id: testAgent.id } }).catch(() => {});
  }

  console.log("=============================================================");
  console.log("               TEST SUITE EXECUTION SUMMARY                  ");
  console.log("=============================================================");
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`Total Tests Executed: ${total}`);
  console.log(`Passed:               ${passed}`);
  console.log(`Failed:               ${failed}`);
  console.log("=============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
