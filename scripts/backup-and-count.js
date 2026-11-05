const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  
  const src = path.join(process.cwd(), 'prisma', 'dev.db');
  const backupFileName = `dev.db.backup.${timestamp}`;
  const dest = path.join(process.cwd(), 'prisma', backupFileName);

  fs.copyFileSync(src, dest);
  console.log(`[BACKUP_SUCCESS] Source: ${src}`);
  console.log(`[BACKUP_SUCCESS] Destination: ${dest}`);
  console.log(`[BACKUP_SUCCESS] Size: ${fs.statSync(dest).size} bytes`);

  const prisma = new PrismaClient();
  const counts = {
    User: await prisma.user.count(),
    Agent: await prisma.agent.count(),
    Role: await prisma.role.count(),
    Permission: await prisma.permission.count(),
    RolePermission: await prisma.rolePermission.count(),
    AuditLog: await prisma.auditLog.count()
  };

  console.log('[BASELINE_COUNTS]', JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});

