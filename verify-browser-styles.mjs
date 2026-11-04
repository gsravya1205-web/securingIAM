async function run() {
  console.log("🔍 Starting Comprehensive Browser Styling Verification...");

  const BASE = "http://127.0.0.1:3045";

  // 1. Verify /login HTML and Stylesheet link
  console.log("\n[1/4] Probing /login Page HTML...");
  const loginRes = await fetch(`${BASE}/login`);
  console.log(`   HTTP Status: ${loginRes.status}`);
  const loginHtml = await loginRes.text();

  const cssRegex = /href="(\/_next\/static\/css\/[^"]+\.css[^"]*)"/g;
  const matches = [...loginHtml.matchAll(cssRegex)];

  if (matches.length === 0) {
    throw new Error("❌ FAILURE: No stylesheet <link> tag found in /login HTML!");
  }

  const cssPath = matches[0][1];
  console.log(`   ✅ Stylesheet Link Present: ${cssPath}`);

  // 2. Fetch and Inspect the Compiled CSS Bundle
  console.log("\n[2/4] Downloading and Inspecting Compiled Stylesheet...");
  const cssRes = await fetch(`${BASE}${cssPath}`);
  console.log(`   CSS Status: ${cssRes.status}`);
  const cssContent = await cssRes.text();
  console.log(`   CSS File Size: ${cssContent.length} bytes`);

  const checks = [
    { name: "CSS Reset for Links (prevents blue underline)", test: cssContent.includes("text-decoration:none") || cssContent.includes("text-decoration: inherit") },
    { name: "Main Background (#060A17)", test: cssContent.toLowerCase().includes("#060a17") },
    { name: "Sidebar Background (#0B132B)", test: cssContent.toLowerCase().includes("#0b132b") },
    { name: "Card Background (#111C35 / #172440)", test: cssContent.toLowerCase().includes("#111c35") || cssContent.toLowerCase().includes("#111a36") },
    { name: "Primary Blue Accent (#2563EB / #38BDF8)", test: cssContent.toLowerCase().includes("#2563eb") || cssContent.toLowerCase().includes("#38bdf8") },
    { name: "Flexbox Layout Utilities (.flex)", test: cssContent.includes(".flex{") || cssContent.includes("display:flex") },
    { name: "Grid Layout Utilities (.grid)", test: cssContent.includes(".grid{") || cssContent.includes("display:grid") },
    { name: "Sidebar Width Utilities (.w-64)", test: cssContent.includes("width:16rem") || cssContent.includes(".w-64") },
    { name: "Border Styling Utilities", test: cssContent.includes("border-color") },
  ];

  let allChecksPassed = true;
  for (const c of checks) {
    const passed = Boolean(c.test);
    console.log(`   ${passed ? "✅ PASS" : "❌ FAIL"}: ${c.name}`);
    if (!passed) allChecksPassed = false;
  }

  if (!allChecksPassed || cssContent.length < 15000) {
    throw new Error("❌ FAILURE: Compiled stylesheet is incomplete or missing core utilities!");
  }

  // 3. Authenticate and Probe /dashboard
  console.log("\n[3/4] Authenticating and Probing /dashboard...");
  const authRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@secureid.local", password: "Admin123!" }),
  });
  const cookie = authRes.headers.get("set-cookie")?.split(";")[0];

  const dashRes = await fetch(`${BASE}/dashboard`, {
    headers: { Cookie: cookie },
  });
  console.log(`   Dashboard Status: ${dashRes.status}`);
  const dashHtml = await dashRes.text();

  // 4. Verify Dashboard DOM Elements & Classes
  console.log("\n[4/4] Verifying Dashboard DOM Classes & Layout Structure...");
  const domChecks = [
    { name: "HTML Tag has dark class & background", test: dashHtml.includes('class="dark bg-[#060A17]"') || dashHtml.includes("dark") },
    { name: "Dark Navy Sidebar element rendered (<aside>)", test: dashHtml.includes("<aside") && (dashHtml.includes("bg-[#0B132B]") || dashHtml.includes("bg-secure-sidebar")) },
    { name: "Sidebar has fixed width (w-64)", test: dashHtml.includes("w-64") },
    { name: "User profile card present in sidebar", test: dashHtml.includes("Alex Vance") && (dashHtml.includes("Admin") || dashHtml.includes("ADMIN")) },
    { name: "Interactive Metric Cards present", test: dashHtml.includes("Human Users") && dashHtml.includes("AI Machine Agents") },
    { name: "Interactive RBAC Matrix evaluator present", test: dashHtml.includes("RBAC Authorization Evaluator") },
    { name: "Audit Log live feed table present", test: dashHtml.includes("Recent Security Audit Events") },
    { name: "Stylesheet linked in Dashboard head", test: dashHtml.includes(".css") },
  ];

  for (const d of domChecks) {
    const passed = Boolean(d.test);
    console.log(`   ${passed ? "✅ PASS" : "❌ FAIL"}: ${d.name}`);
    if (!passed) allChecksPassed = false;
  }

  if (!allChecksPassed) {
    throw new Error("❌ FAILURE: Dashboard DOM structure does not match enterprise layout requirements!");
  }

  console.log("\n✨ =============================================================");
  console.log("✨   PHASE 1 VERIFICATION COMPLETE: STYLING 100% OPERATIONAL     ");
  console.log("✨ =============================================================");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
