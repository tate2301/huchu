import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { recordActivityWrite } from '@/lib/activity/record'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// The explicit return annotation is load-bearing for typecheck time: without
// it, `globalForPrisma.prisma ?? createPrismaClient()` makes tsc structurally
// unify the default-parameterised PrismaClient with the one inferred from the
// options object — a 30-second comparison across the generated client types.
// Annotated, both branches are the same nominal type and the check is instant.
function createPrismaClient(): PrismaClient {
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

    const client = new PrismaClient({
      adapter,
      transactionOptions: {
        maxWait: parseNumber(process.env.PRISMA_TX_MAX_WAIT_MS, 10000),
        timeout: parseNumber(process.env.PRISMA_TX_TIMEOUT_MS, 60000),
      },
    })

    // The activity log's recorder: every write, once it has succeeded, is
    // offered to the request it was made in (`lib/activity/record.ts`). Reads
    // pass straight through. The cast is honest — a query-only extension adds
    // nothing to the client's API — and keeps the annotation above nominal.
    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const result = await query(args)
            recordActivityWrite({ model, operation, queryArgs: args, result })
            return result
          },
        },
      },
    }) as unknown as PrismaClient
  } catch (error) {
    console.error('Failed to create Prisma client adapter:', error)
    throw error
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
