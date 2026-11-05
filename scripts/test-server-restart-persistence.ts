import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3040";

async function loginUser(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  let cookie = res.headers.get("set-cookie");
  if (!cookie && typeof (res.headers as any).getSetCookie === "function") {
    const list = (res.headers as any).getSetCookie();
    if (list && list.length > 0) cookie = list[0];
  }
  if (!cookie) throw new Error(`No cookie for ${email}. Status: ${res.status}`);
  return cookie.split(";")[0];
}

async function step1_create() {
  const adminCookie = await loginUser("admin@secureid.local", "Admin123!");
  const uniqueName = `PersistenceTest-${Date.now()}`;

  const res = await fetch(`${BASE}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      targetAction: "reports.create",
      resource: `Resource:${uniqueName}`,
      justification: "Verifying durability across complete server restarts",
      expiresInHours: 48,
    }),
  });
  const data = await res.json();
  console.log("CREATED_TICKET:", JSON.stringify({
    id: data.approval.id,
    resource: data.approval.resource,
    createdAt: data.approval.createdAt,
    status: data.approval.status
  }));
}

async function step2_verify(ticketId: string) {
  const adminCookie = await loginUser("admin@secureid.local", "Admin123!");
  const res = await fetch(`${BASE}/api/approvals/${ticketId}`, {
    headers: { Cookie: adminCookie },
  });
  const data = await res.json();
  console.log("VERIFIED_TICKET_POST_RESTART:", JSON.stringify({
    id: data.approval.id,
    resource: data.approval.resource,
    createdAt: data.approval.createdAt,
    status: data.approval.status
  }));
}

const mode = process.argv[2];
const argId = process.argv[3];

if (mode === "create") {
  step1_create().then(() => prisma.$disconnect());
} else if (mode === "verify") {
  step2_verify(argId).then(() => prisma.$disconnect());
} else {
  console.log("Usage: node test-server-restart-persistence.ts [create|verify] [ticketId]");
}
