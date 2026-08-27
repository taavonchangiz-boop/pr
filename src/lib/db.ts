import { PrismaClient } from "@prisma/client";

// POSTYAR prisma client. In dev, log warnings only (not full queries —
// they leak data and clutter the log). Use global singleton to survive
// Next.js HMR.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
