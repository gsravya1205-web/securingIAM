import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting SecureID database seed...");

  // 1. Define Initial Permissions
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
  console.log(`✅ Seeded ${permissionsData.length} granular permissions.`);

  // 2. Define Initial Roles
  const rolesData = [
    {
      name: "Admin",
      description: "Full system administrative control across all resources and agents.",
      permissionCodes: [
        "users.read",
        "users.create",
        "users.update",
        "users.delete",
        "reports.read",
        "reports.create",
        "roles.read",
        "roles.manage",
        "agents.read",
        "agents.manage",
        "audit.read",
      ],
    },
    {
      name: "Manager",
      description: "Supervisory access to monitor users, view reports, and oversee AI agents.",
      permissionCodes: [
        "users.read",
        "reports.read",
        "reports.create",
        "roles.read",
        "agents.read",
        "audit.read",
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
      create: {
        name: r.name,
        description: r.description,
      },
    });
    rolesMap.set(r.name, roleRecord.id);

    // Synchronize RolePermissions
    // Delete existing mappings for idempotency
    await prisma.rolePermission.deleteMany({
      where: { roleId: roleRecord.id },
    });

    // Create current mappings
    const mappings = r.permissionCodes.map((code) => ({
      roleId: roleRecord.id,
      permissionId: permissionsMap.get(code)!,
    }));

    await prisma.rolePermission.createMany({
      data: mappings,
    });
  }
  console.log(`✅ Seeded ${rolesData.length} roles with mapped permissions.`);

  // 3. Create Sample Demo Accounts with Bcrypt Hashed Passwords
  const passwordSaltRounds = 10;
  const adminPasswordHash = await bcrypt.hash("Admin123!", passwordSaltRounds);
  const managerPasswordHash = await bcrypt.hash("Manager123!", passwordSaltRounds);
  const employeePasswordHash = await bcrypt.hash("Employee123!", passwordSaltRounds);

  const demoUsers = [
    {
      email: "admin@secureid.local",
      name: "Alex Vance",
      passwordHash: adminPasswordHash,
      roleId: rolesMap.get("Admin")!,
    },
    {
      email: "manager@secureid.local",
      name: "Morgan Chen",
      passwordHash: managerPasswordHash,
      roleId: rolesMap.get("Manager")!,
    },
    {
      email: "employee@secureid.local",
      name: "Taylor Brooks",
      passwordHash: employeePasswordHash,
      roleId: rolesMap.get("Employee")!,
    },
  ];

  for (const user of demoUsers) {
    const userRecord = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash: user.passwordHash,
        roleId: user.roleId,
      },
      create: user,
    });
    console.log(`👤 Seeded User: ${userRecord.email} [${user.name}]`);
  }

  // 4. Create Sample AI Agent Identities
  const sampleAgents = [
    {
      name: "Report Assistant",
      description: "Generates scheduled compliance audits and summarizes security telemetry.",
      keySecret: "sec_agent_rep_ast_8821",
      status: "ACTIVE",
      rateLimit: 60,
    },
    {
      name: "User Support Agent",
      description: "Assists with identity verification queries and triage for access requests.",
      keySecret: "sec_agent_usr_spt_4419",
      status: "ACTIVE",
      rateLimit: 100,
    },
    {
      name: "Security Monitoring Agent",
      description: "Autonomous threat monitor evaluating anomalous privilege spikes and API traffic.",
      keySecret: "sec_agent_sec_mon_7730",
      status: "ACTIVE",
      rateLimit: 150,
    },
    {
      name: "Sentinel-LogAnalyzer",
      description: "Autonomous background log analyzer verifying zero-trust compliance.",
      keySecret: "sec_agent_live_demo_key_9941",
      status: "ACTIVE",
      rateLimit: 120,
    },
  ];

  for (const ag of sampleAgents) {
    const hash = await bcrypt.hash(ag.keySecret, passwordSaltRounds);
    const agentRecord = await prisma.agent.upsert({
      where: { name: ag.name },
      update: {
        description: ag.description,
        apiKeyHash: hash,
        status: ag.status,
        rateLimit: ag.rateLimit,
        roleId: rolesMap.get("AI Agent")!,
      },
      create: {
        name: ag.name,
        description: ag.description,
        apiKeyHash: hash,
        status: ag.status,
        rateLimit: ag.rateLimit,
        roleId: rolesMap.get("AI Agent")!,
      },
    });
    console.log(`🤖 Seeded AI Agent: ${agentRecord.name} [Status: ${agentRecord.status}]`);
  }

  // 5. Seed Initial Audit Log
  await prisma.auditLog.create({
    data: {
      actorType: "SYSTEM",
      actorId: "seed-runner",
      actorName: "SecureID System Initializer",
      action: "DATABASE_SEEDED",
      resource: "Database:dev.db",
      status: "SUCCESS",
      details: "Initial RBAC permissions, roles, demo users, and AI Agent identities provisioned.",
    },
  });
  console.log("📜 Seeded initial security audit log.");

  console.log("\n✨ Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error while seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

