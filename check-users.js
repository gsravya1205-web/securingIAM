const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    include: { role: true }
  });
  console.log('Total users:', users.length);
  for (const u of users) {
    const isPw123 = await bcrypt.compare('123', u.passwordHash);
    const isPwRole123 = await bcrypt.compare('Role123!', u.passwordHash);
    const isPwAdmin123 = await bcrypt.compare('admin123', u.passwordHash);
    const isPwPassword123 = await bcrypt.compare('password123', u.passwordHash);
    console.log(`Email: ${u.email} | Role: ${u.role?.name} | Name: ${u.name}`);
    console.log(`   Matches '123': ${isPw123} | 'Role123!': ${isPwRole123} | 'admin123': ${isPwAdmin123} | 'password123': ${isPwPassword123}`);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());

