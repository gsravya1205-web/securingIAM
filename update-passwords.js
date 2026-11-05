const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log("Updating demo passwords...");
  const adminRole = await prisma.role.findUnique({ where: { name: "Admin" } });
  const managerRole = await prisma.role.findUnique({ where: { name: "Manager" } });
  const employeeRole = await prisma.role.findUnique({ where: { name: "Employee" } });

  const hash123 = await bcrypt.hash("123", 10);
  const hashAdmin123 = await bcrypt.hash("admin123", 10);
  const hashManager123 = await bcrypt.hash("manager123", 10);
  const hashEmployee123 = await bcrypt.hash("employee123", 10);

  // 1. gayatri@gmail.com
  await prisma.user.upsert({
    where: { email: "gayatri@gmail.com" },
    update: { passwordHash: hash123, roleId: adminRole.id, name: "Gayatri" },
    create: { email: "gayatri@gmail.com", passwordHash: hash123, roleId: adminRole.id, name: "Gayatri" }
  });

  // 2. admin@secureid.local
  await prisma.user.updateMany({
    where: { email: "admin@secureid.local" },
    data: { passwordHash: hashAdmin123 }
  });

  // 3. manager@secureid.local
  if (managerRole) {
    await prisma.user.updateMany({
      where: { email: "manager@secureid.local" },
      data: { passwordHash: hashManager123 }
    });
  }

  // 4. employee@secureid.local
  if (employeeRole) {
    await prisma.user.updateMany({
      where: { email: "employee@secureid.local" },
      data: { passwordHash: hashEmployee123 }
    });
  }

  console.log("Done updating demo passwords!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

