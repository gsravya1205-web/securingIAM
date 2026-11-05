const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: { select: { name: true } } }
  });
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, status: true, role: { select: { name: true } } }
  });
  console.log('USERS:', JSON.stringify(users, null, 2));
  console.log('AGENTS:', JSON.stringify(agents, null, 2));
  await prisma.$disconnect();
}

main();

