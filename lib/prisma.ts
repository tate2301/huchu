import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // For Prisma 7.x, we need to use adapter or accelerateUrl
  // During build time without DATABASE_URL, we'll create a mock client
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.warn('DATABASE_URL not set. Prisma client will be limited.')
    return new PrismaClient() as any
  }

  try {
    const { PrismaPg } = require('@prisma/adapter-pg')
    const { Pool } = require('pg')
    
    const pool = new Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    
    return new PrismaClient({ adapter })
  } catch (error) {
    console.warn('Failed to create Prisma client with adapter:', error)
    return new PrismaClient() as any
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
