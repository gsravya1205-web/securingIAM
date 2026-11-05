const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.agent.updateMany({
    data: { status: 'ACTIVE' }
  });
  console.log(`Reactivated ${result.count} agents.`);
  await prisma.$disconnect();
}

main();

