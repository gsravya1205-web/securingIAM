import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking current users...");
  const users = await prisma.user.findMany({
    include: { role: true },
  });
  console.log("Found", users.length, "users:");
  for (const u of users) {
    console.log(`- ${u.email} (${u.name}) -> Role: ${u.role?.name}`);
  }

  // Get Admin Role
  const adminRole = await prisma.role.findUnique({
    where: { name: "Admin" },
  });

  const managerRole = await prisma.role.findUnique({
    where: { name: "Manager" },
  });

  const employeeRole = await prisma.role.findUnique({
    where: { name: "Employee" },
  });

  if (!adminRole) {
    console.error("Admin role not found!");
    return;
  }

  // Hash simple passwords
  // For demo: admin123, manager123, employee123, and also simple 123456
  const simpleAdminHash = await bcrypt.hash("admin123", 10);
  const simpleManagerHash = await bcrypt.hash("manager123", 10);
  const simpleEmployeeHash = await bcrypt.hash("employee123", 10);
  const simple123Hash = await bcrypt.hash("123456", 10);

  // 1. Ensure gayatri@gmail.com exists as an Admin
  const gayatri = await prisma.user.upsert({
    where: { email: "gayatri@gmail.com" },
    update: {
      name: "Gayatri",
      passwordHash: simple123Hash,
      roleId: adminRole.id,
    },
    create: {
      email: "gayatri@gmail.com",
      name: "Gayatri",
      passwordHash: simple123Hash,
      roleId: adminRole.id,
    },
  });
  console.log("Provisioned user:", gayatri.email, "as Admin with password '123456' / 'admin123' / '123'");

  // 2. Also ensure admin@demo.com exists as an Admin
  await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {
      name: "Demo Admin",
      passwordHash: simpleAdminHash,
      roleId: adminRole.id,
    },
    create: {
      email: "admin@demo.com",
      name: "Demo Admin",
      passwordHash: simpleAdminHash,
      roleId: adminRole.id,
    },
  });

  // 3. Update admin@secureid.local password hash
  await prisma.user.updateMany({
    where: { email: "admin@secureid.local" },
    data: { passwordHash: simpleAdminHash },
  });

  // 4. Update manager@secureid.local password hash
  if (managerRole) {
    await prisma.user.updateMany({
      where: { email: "manager@secureid.local" },
      data: { passwordHash: simpleManagerHash },
    });
  }

  // 5. Update employee@secureid.local password hash
  if (employeeRole) {
    await prisma.user.updateMany({
      where: { email: "employee@secureid.local" },
      data: { passwordHash: simpleEmployeeHash },
    });
  }

  console.log("All demo user credentials updated successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

