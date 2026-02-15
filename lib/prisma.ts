import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createPrismaClient() {
  // Prisma 7.x client engine requires a driver adapter or accelerateUrl.
  try {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      console.warn('DATABASE_URL not set. Prisma will use PG* env vars.')
    }

    const poolConfig = {
      max: parseNumber(process.env.PG_POOL_MAX, 10),
      idleTimeoutMillis: parseNumber(process.env.PG_POOL_IDLE_MS, 10000),
      connectionTimeoutMillis: parseNumber(process.env.PG_POOL_CONN_MS, 5000),
    }
    const pool = connectionString
      ? new Pool({ connectionString, ...poolConfig })
      : new Pool(poolConfig)
    const adapter = new PrismaPg(pool)

    return new PrismaClient({
      adapter,
      transactionOptions: {
        maxWait: parseNumber(process.env.PRISMA_TX_MAX_WAIT_MS, 10000),
        timeout: parseNumber(process.env.PRISMA_TX_TIMEOUT_MS, 60000),
      },
    })
  } catch (error) {
    console.error('Failed to create Prisma client adapter:', error)
    throw error
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
