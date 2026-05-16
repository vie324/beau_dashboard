import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Fallback keeps the client constructible when DATABASE_URL is not yet set
// (e.g. before a database is connected on Vercel) so non-DB pages still render.
const datasourceUrl =
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
