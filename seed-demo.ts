import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedDemoData() {
  console.log("🌱 =============================================================");
  console.log("🌱   SECUREID - DEMONSTRATION ENVIRONMENT INITIALIZATION        ");
  console.log("🌱 =============================================================\n");

  // 1. Granular System Permissions
  const permissionsData = [
    { code: "users.read", description: "View human user accounts and profiles", category: "USERS" },
    { code: "users.create", description: "Provision new human user accounts", category: "USERS" },
    { code: "users.update", description: "Edit user profile details and assignments", category: "USERS" },
    { code: "users.delete", description: "Deactivate or delete user accounts", category: "USERS" },
    { code: "reports.read", description: "View security and analytical reports", category: "REPORTS" },
    { code: "reports.create", description: "Generate new audit and compliance reports", category: "REPORTS" },
    { code: "roles.read", description: "Inspect system roles and permission matrices", category: "ROLES" },
    { code: "roles.manage", description: "Create, edit, or modify role definitions", category: "ROLES" },
    { code: "agents.read", description: "View AI agent identities and telemetry", category: "AGENTS" },
    { code: "agents.manage", description: "Register, modify, or revoke AI agents", category: "AGENTS" },
    { code: "audit.read", description: "Access immutable security audit logs", category: "AUDIT" },
  ];

  const permissionsMap = new Map<string, string>();
  for (const perm of permissionsData) {
    const record = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, category: perm.category },
      create: perm,
    });
    permissionsMap.set(perm.code, record.id);
  }
  console.log(`✅ ${permissionsData.length} granular permissions verified.`);

  // 2. Enterprise Roles
  const rolesData = [
    {
      name: "Admin",
      description: "Full system administrative control across all resources and agents.",
      permissionCodes: [
        "users.read", "users.create", "users.update", "users.delete",
        "reports.read", "reports.create", "roles.read", "roles.manage",
        "agents.read", "agents.manage", "audit.read"
      ],
    },
    {
      name: "Manager",
      description: "Supervisory access to monitor users, view reports, and oversee AI agents.",
      permissionCodes: [
        "users.read", "reports.read", "reports.create", "roles.read", "agents.read", "audit.read"
      ],
    },
    {
      name: "Employee",
      description: "Standard end-user access restricted strictly to viewing relevant reports.",
      permissionCodes: ["reports.read"],
    },
    {
      name: "AI Agent",
      description: "Autonomous machine identity constrained to reporting and agent telemetry.",
      permissionCodes: ["reports.read", "reports.create", "agents.read"],
    },
  ];

  const rolesMap = new Map<string, string>();
  for (const r of rolesData) {
    const roleRecord = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
    rolesMap.set(r.name, roleRecord.id);

    // Sync role permissions
    await prisma.rolePermission.deleteMany({ where: { roleId: roleRecord.id } });
    for (const code of r.permissionCodes) {
      const pId = permissionsMap.get(code);
      if (pId) {
        await prisma.rolePermission.create({
          data: { roleId: roleRecord.id, permissionId: pId },
        });
      }
    }
  }
  console.log(`✅ Enterprise roles & permission matrices synchronized.`);

  // 3. Demo Human Users
  const adminRoleId = rolesMap.get("Admin")!;
  const managerRoleId = rolesMap.get("Manager")!;
  const employeeRoleId = rolesMap.get("Employee")!;

  const demoUsers = [
    {
      email: "admin@secureid.local",
      name: "Alex Vance",
      password: "admin123",
      roleId: adminRoleId,
    },
    {
      email: "manager@secureid.local",
      name: "Morgan Chen",
      password: "manager123",
      roleId: managerRoleId,
    },
    {
      email: "employee@secureid.local",
      name: "Taylor Brooks",
      password: "employee123",
      roleId: employeeRoleId,
    },
    {
      email: "gayatri@gmail.com",
      name: "Gayatri",
      password: "123",
      roleId: adminRoleId,
    },
  ];

  const userMap = new Map<string, any>();
  for (const u of demoUsers) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash, roleId: u.roleId },
      create: { email: u.email, name: u.name, passwordHash, roleId: u.roleId },
    });
    userMap.set(u.email, user);
  }
  console.log(`✅ Demo accounts verified with password shortcuts (admin123, manager123, employee123, 123).`);

  // 4. Official Demonstration AI Agent
  const aiAgentRoleId = rolesMap.get("AI Agent")!;
  const DEMO_AGENT_NAME = "SecureID Research Assistant";
  const DEMO_AGENT_RAW_KEY = "sec_agent_research_assistant_live_key";
  const agentKeyHash = await bcrypt.hash(DEMO_AGENT_RAW_KEY, 10);

  const demoAgent = await prisma.agent.upsert({
    where: { name: DEMO_AGENT_NAME },
    update: {
      status: "ACTIVE",
      apiKeyHash: agentKeyHash,
      roleId: aiAgentRoleId,
      rateLimit: 120,
    },
    create: {
      name: DEMO_AGENT_NAME,
      description: "Official demonstration agent executing autonomous least-privilege operations.",
      apiKeyHash: agentKeyHash,
      status: "ACTIVE",
      roleId: aiAgentRoleId,
      rateLimit: 120,
    },
  });
  console.log(`✅ Official Demonstration Agent ready: '${demoAgent.name}' (Token: ${DEMO_AGENT_RAW_KEY})`);

  // 5. Seed Demonstration Pending Approvals
  const taylor = userMap.get("employee@secureid.local");
  const existingPendingApproval = await prisma.approvalRequest.findFirst({
    where: { status: "PENDING", targetAction: "reports.create" },
  });

  if (!existingPendingApproval && taylor) {
    await prisma.approvalRequest.create({
      data: {
        requesterType: "USER",
        requesterId: taylor.id,
        requesterName: taylor.name,
        targetAction: "reports.create",
        resource: "Compliance:QuarterlyAudit",
        justification: "Requesting supervisor authorization to export high-privilege quarterly compliance audit report.",
        status: "PENDING",
      },
    });
    console.log(`✅ Seeded sample pending approval ticket for supervisor review.`);
  }

  // 6. Seed Baseline Audit Logs
  const alex = userMap.get("admin@secureid.local");
  await prisma.auditLog.create({
    data: {
      actorType: "USER",
      actorId: alex?.id || "system-init",
      actorName: alex?.name || "System Admin",
      action: "PLATFORM_INITIALIZATION",
      resource: "System:Core",
      status: "SUCCESS",
      details: "SecureID demonstration environment successfully seeded and verified for evaluation.",
      userId: alex?.id,
    },
  });

  console.log("\n🚀 =============================================================");
  console.log("🚀   SECUREID DEMO ENVIRONMENT READY ON PORT 3040               ");
  console.log("🚀 =============================================================\n");
}

seedDemoData()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

