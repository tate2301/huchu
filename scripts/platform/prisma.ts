import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("DATABASE_URL not set. Prisma will use PG* env vars.");
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const poolConfig = {
  max: parseNumber(process.env.PG_POOL_MAX, 10),
  idleTimeoutMillis: parseNumber(process.env.PG_POOL_IDLE_MS, 10000),
  connectionTimeoutMillis: parseNumber(process.env.PG_POOL_CONN_MS, 5000),
};
const pool = connectionString
  ? new Pool({ connectionString, ...poolConfig })
  : new Pool(poolConfig);
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: {
    maxWait: parseNumber(process.env.PRISMA_TX_MAX_WAIT_MS, 10000),
    timeout: parseNumber(process.env.PRISMA_TX_TIMEOUT_MS, 60000),
  },
});

let disconnectPromise: Promise<void> | null = null;

export async function disconnectPrisma() {
  if (!disconnectPromise) {
    disconnectPromise = prisma.$disconnect();
  }

  await disconnectPromise;
}
