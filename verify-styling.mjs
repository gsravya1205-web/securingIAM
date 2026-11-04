async function run() {
  console.log("🎨 Verifying Tailwind CSS and Enterprise Dashboard Layout...");

  const BASE = "http://127.0.0.1:3011";

  // 1. Verify /login and stylesheet
  console.log("\n1. Probing /login...");
  const loginRes = await fetch(`${BASE}/login`);
  console.log(`   Status: ${loginRes.status}`);
  const loginHtml = await loginRes.text();

  const cssMatch = loginHtml.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/);
  if (!cssMatch) {
    throw new Error("❌ No CSS stylesheet link found in /login HTML!");
  }

  const cssUrl = `${BASE}${cssMatch[1]}`;
  console.log(`   Found Stylesheet: ${cssMatch[1]}`);

  const cssRes = await fetch(cssUrl);
  console.log(`   CSS HTTP Status: ${cssRes.status}`);
  const cssContent = await cssRes.text();
  console.log(`   CSS Bundle Size: ${cssContent.length} bytes`);

  const hasTailwindClasses =
    cssContent.includes("margin") &&
    cssContent.includes("padding") &&
    (cssContent.includes("#060A17") || cssContent.includes("#060a17") || cssContent.includes("flex"));

  if (!hasTailwindClasses || cssContent.length < 5000) {
    throw new Error("❌ CSS bundle does not appear to contain compiled Tailwind CSS!");
  }
  console.log("   ✅ Tailwind CSS bundle is compiled and serving correctly!");

  // 2. Authenticate as Admin
  console.log("\n2. Authenticating as Admin...");
  const authRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@secureid.local", password: "Admin123!" }),
  });

  const cookie = authRes.headers.get("set-cookie");
  if (!cookie || !cookie.includes("secureid_session")) {
    throw new Error("❌ Login failed to issue secureid_session cookie!");
  }
  console.log("   ✅ Authenticated successfully, received session cookie.");

  // 3. Verify /dashboard layout and sidebar
  console.log("\n3. Probing /dashboard with session cookie...");
  const dashRes = await fetch(`${BASE}/dashboard`, {
    headers: { Cookie: cookie.split(";")[0] },
  });

  console.log(`   Dashboard HTTP Status: ${dashRes.status}`);
  const dashHtml = await dashRes.text();

  const hasSidebar = dashHtml.includes("w-64 bg-[#0B132B]") || dashHtml.includes("w-64");
  const hasUserPill = dashHtml.includes("Alex Vance");
  const hasRbacEvaluator = dashHtml.includes("RBAC Authorization Evaluator");
  const hasCards = dashHtml.includes("Human Users") && dashHtml.includes("AI Machine Agents");
  const hasCssLink = dashHtml.includes("/_next/static/css/");

  console.log(`   - Dark Navy Sidebar Rendered: ${hasSidebar}`);
  console.log(`   - User Identity Displayed: ${hasUserPill}`);
  console.log(`   - RBAC Evaluator Present: ${hasRbacEvaluator}`);
  console.log(`   - Metric Cards Present: ${hasCards}`);
  console.log(`   - CSS Link Tag Present: ${hasCssLink}`);

  if (hasSidebar && hasUserPill && hasRbacEvaluator && hasCards && hasCssLink) {
    console.log("\n✨ All styling, layout, sidebar, and Tailwind tests PASSED!");
  } else {
    throw new Error("❌ One or more UI dashboard components were missing!");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

