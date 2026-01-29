import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Prisma 7.x client engine requires a driver adapter or accelerateUrl.
  try {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      console.warn('DATABASE_URL not set. Prisma will use PG* env vars.')
    }

    const pool = connectionString ? new Pool({ connectionString }) : new Pool()
    const adapter = new PrismaPg(pool)

    return new PrismaClient({ adapter })
  } catch (error) {
    console.error('Failed to create Prisma client adapter:', error)
    throw error
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
