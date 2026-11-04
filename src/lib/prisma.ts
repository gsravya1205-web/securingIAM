import { PrismaClient } from "@prisma/client";

// In Next.js development, hot-reloading can create multiple PrismaClient instances.
// This singleton pattern ensures only one connection pool exists.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

