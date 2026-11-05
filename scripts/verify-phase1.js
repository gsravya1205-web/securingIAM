const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[VERIFICATION_START]');

  const counts = {
    User: await prisma.user.count(),
    Agent: await prisma.agent.count(),
    Role: await prisma.role.count(),
    Permission: await prisma.permission.count(),
    RolePermission: await prisma.rolePermission.count(),
    AuditLog: await prisma.auditLog.count(),
    ApprovalRequest: await prisma.approvalRequest.count(),
    Delegation: await prisma.delegation.count()
  };

  console.log('[POST_SYNC_COUNTS]', JSON.stringify(counts, null, 2));

  // Check sqlite tables directly
  const tables = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`);
  console.log('[SQLITE_TABLES]', JSON.stringify(tables.map(t => t.name), null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[VERIFY_ERROR]', err);
  process.exit(1);
});

