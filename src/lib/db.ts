import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

const globalForEnv = globalThis as unknown as { envLoaded?: boolean };
if (!globalForEnv.envLoaded) {
  loadEnvConfig(process.cwd());
  globalForEnv.envLoaded = true;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
