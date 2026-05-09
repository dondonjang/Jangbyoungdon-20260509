import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type PrismaGlobal = typeof globalThis & {
  __msaPrisma?: PrismaClient;
};

function readDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DIRECT_URL is required.");
  }

  return databaseUrl;
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: readDatabaseUrl() }),
  });
}

const prismaGlobal = globalThis as PrismaGlobal;

export const prisma = prismaGlobal.__msaPrisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.__msaPrisma = prisma;
}
