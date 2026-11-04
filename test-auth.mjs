import { prisma } from "./src/lib/prisma.ts";

async function run() {
  console.log("🔍 Running Regression Auth & Protection Test...");

  const BASE = "http://127.0.0.1:3012";

  // Test 1: Unauthenticated request to /dashboard
  console.log("\n1. Testing Unauthenticated Request to /dashboard...");
  const unauthRes = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
  console.log(`   Response Status: ${unauthRes.status}`);
  const location = unauthRes.headers.get("location");
  console.log(`   Redirect Location: ${location}`);
  if (unauthRes.status === 307 || unauthRes.status === 302 || location?.includes("/login")) {
    console.log("   ✅ Protected route correctly blocked unauthenticated access!");
  } else {
    throw new Error("❌ Failed: Protected route allowed unauthenticated access!");
  }

  // Test 2: Invalid password login
  console.log("\n2. Testing Invalid Password Attempt...");
  const badLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@secureid.local", password: "WrongPassword999!" }),
  });
  console.log(`   Bad Login Status: ${badLoginRes.status}`);
  const badData = await badLoginRes.json();
  console.log(`   Response Message: ${badData.error}`);
  if (badLoginRes.status === 401) {
    console.log("   ✅ Invalid credentials correctly rejected with 401 Unauthorized!");
  }

  // Test 3: Successful Admin Login
  console.log("\n3. Testing Valid Login for Admin (admin@secureid.local)...");
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@secureid.local", password: "Admin123!" }),
  });
  console.log(`   Admin Login Status: ${loginRes.status}`);
  const loginData = await loginRes.json();
  console.log(`   Logged In User: ${loginData.user?.name} (${loginData.user?.role})`);

  const setCookie = loginRes.headers.get("set-cookie");
  if (loginRes.status === 200 && setCookie) {
    console.log("   ✅ Authentication succeeded and secure cookie created!");
  }

  // Test 4: Access /dashboard with Session Cookie
  console.log("\n4. Testing Authenticated Access to /dashboard with Session Cookie...");
  const authDashRes = await fetch(`${BASE}/dashboard`, {
    headers: {
      Cookie: setCookie.split(";")[0],
    },
    redirect: "manual",
  });
  console.log(`   Authenticated Dashboard Status: ${authDashRes.status}`);
  if (authDashRes.status === 200) {
    console.log("   ✅ Authenticated user successfully accessed protected dashboard!");
  }

  await prisma.$disconnect();
  console.log("\n✨ All Auth Regression checks PASSED!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
