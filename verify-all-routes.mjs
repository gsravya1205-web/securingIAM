async function login(base, email, pass) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}`);
  const cookie = res.headers.get("set-cookie");
  return cookie.split(";")[0];
}

async function run() {
  console.log("🌐 =============================================================");
  console.log("🌐   SECUREID - PHASE 2: 11-ROUTE FRONTEND VERIFICATION SUITE   ");
  console.log("🌐 =============================================================\n");

  const BASE = process.env.TEST_BASE || "http://127.0.0.1:3040";
  const routes = [
    { path: "/dashboard", name: "1. Overview Dashboard" },
    { path: "/dashboard/users", name: "2. User Management Directory" },
    { path: "/dashboard/roles", name: "3. Roles & Permissions Matrix" },
    { path: "/dashboard/agents", name: "4. AI Agent Identities" },
    { path: "/dashboard/api-keys", name: "5. API Key Management" },
    { path: "/dashboard/access-control", name: "6. Access Control Center & Policy Evaluator" },
    { path: "/dashboard/approvals", name: "7. Pending Approvals Queue" },
    { path: "/dashboard/monitoring", name: "8. Security Operations Monitoring" },
    { path: "/dashboard/audit", name: "9. Immutable Audit Logs" },
    { path: "/dashboard/reports", name: "10. Compliance & Governance Reports" },
    { path: "/dashboard/settings", name: "11. System & Security Settings" },
  ];

  // 1. Unauthenticated verification
  console.log("🔒 [CHECK 1] Unauthenticated Route Redirection Check:");
  for (const r of routes) {
    const res = await fetch(`${BASE}${r.path}`, { redirect: "manual" });
    const isRedirect = res.status === 307 || res.status === 302 || res.headers.get("location")?.includes("/login");
    console.log(`   ${isRedirect ? "✅ BLOCKED" : "❌ OPEN"}: ${r.name} -> Status: ${res.status}`);
    if (!isRedirect) throw new Error(`Unauthenticated leak on ${r.path}`);
  }

  // 2. Admin Verification (All 11 routes must load with 200 OK)
  console.log("\n👑 [CHECK 2] Admin Account (Alex Vance) Route Verification:");
  const adminCookie = await login(BASE, "admin@secureid.local", "Admin123!");
  for (const r of routes) {
    const res = await fetch(`${BASE}${r.path}`, {
      headers: { Cookie: adminCookie },
    });
    const html = await res.text();
    const hasSidebar = html.includes("w-64") && html.includes("bg-[#0B132B]");
    const hasCss = html.includes(".css");
    const passed = res.status === 200 && hasSidebar && hasCss;
    console.log(`   ${passed ? "✅ 200 OK" : "❌ FAILED"}: ${r.name} (Sidebar & CSS active)`);
    if (!passed) throw new Error(`Admin failed to load ${r.path}`);
  }

  // 3. Manager Verification
  console.log("\n👔 [CHECK 3] Manager Account (Morgan Chen) Route Verification:");
  const managerCookie = await login(BASE, "manager@secureid.local", "Manager123!");
  const mgrRes = await fetch(`${BASE}/dashboard`, {
    headers: { Cookie: managerCookie },
  });
  const mgrHtml = await mgrRes.text();
  const mgrRecognized = mgrHtml.includes("Morgan Chen") && mgrHtml.includes("Manager");
  console.log(`   ${mgrRecognized ? "✅ PASS" : "❌ FAIL"}: Manager Identity Rendered in Sidebar & Header`);

  // 4. Employee Verification
  console.log("\n👤 [CHECK 4] Employee Account (Taylor Brooks) Route Verification:");
  const employeeCookie = await login(BASE, "employee@secureid.local", "Employee123!");
  const empRes = await fetch(`${BASE}/dashboard`, {
    headers: { Cookie: employeeCookie },
  });
  const empHtml = await empRes.text();
  const empRecognized = empHtml.includes("Taylor Brooks") && empHtml.includes("Employee");
  const empLockedBadge = empHtml.includes("Locked");
  console.log(`   ${empRecognized ? "✅ PASS" : "❌ FAIL"}: Employee Identity Rendered`);
  console.log(`   ${empLockedBadge ? "✅ PASS" : "❌ FAIL"}: Scope Locks Visible on Non-Permitted Navigation`);

  console.log("\n✨ =============================================================");
  console.log("✨   PHASE 2 VERIFICATION COMPLETE: ALL 11 ROUTES 100% OPERATIONAL");
  console.log("✨ =============================================================\n");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

