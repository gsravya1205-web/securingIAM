import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3040";

async function loginUser(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`No cookie for ${email}`);
  return cookie.split(";")[0];
}

async function run() {
  console.log("⚡ Testing Race Condition / Concurrency Protection on Approvals...");

  const adminCookie = await loginUser("admin@secureid.local", "Admin123!");
  const managerCookie = await loginUser("manager@secureid.local", "Manager123!");

  // Create a pending request
  const testAgent = await prisma.agent.findFirst({ where: { status: "ACTIVE" } });
  const pendingTicket = await prisma.approvalRequest.create({
    data: {
      requesterType: "AGENT",
      requesterId: testAgent!.id,
      requesterName: testAgent!.name,
      targetAction: "reports.create",
      resource: "Reports:ConcurrencyTest",
      justification: "Concurrency validation",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });

  console.log(`Created pending ticket: ${pendingTicket.id}`);

  // Fire two simultaneous reviews: Admin approves, Manager rejects
  const [res1, res2] = await Promise.all([
    fetch(`${BASE}/api/approvals`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ id: pendingTicket.id, decision: "APPROVED", reviewerNote: "Admin review" }),
    }),
    fetch(`${BASE}/api/approvals`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ id: pendingTicket.id, decision: "REJECTED", reviewerNote: "Manager review" }),
    }),
  ]);

  const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

  console.log(`Review 1: HTTP ${res1.status}`, data1.approval?.status || data1.error);
  console.log(`Review 2: HTTP ${res2.status}`, data2.approval?.status || data2.error);

  const statuses = [res1.status, res2.status];
  const hasSuccess = statuses.includes(200);
  const hasConflict = statuses.includes(409);

  if (hasSuccess && hasConflict) {
    console.log("✅ PASS: Exactly one reviewer succeeded (HTTP 200), and the concurrent conflicting review was safely rejected with HTTP 409 Conflict!");
  } else {
    console.error("❌ FAIL: Unexpected statuses:", statuses);
    process.exit(1);
  }

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});

