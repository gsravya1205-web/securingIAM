import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  });
  for (const u of users) {
    console.log(
      u.email,
      "Role:",
      u.role.name,
      "Perms count:",
      u.role.permissions.length,
      u.role.permissions.map((p) => p.permission.code)
    );
  }
}

main().finally(() => prisma.$disconnect());

