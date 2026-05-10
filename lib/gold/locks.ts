import type { PrismaClient, Prisma } from "@prisma/client"

export type LockResource = `import:${string}` | `period-close:${string}` | string
export type AcquiredLock = { resource: LockResource; userId: string; expiresAt: Date }

const LEASE_DURATION_MS = 5 * 60 * 1000

/**
 * Acquire (or refresh) an exclusive editing lease on a resource.
 *
 * Returns { acquired: false, heldBy } when another user holds an unexpired
 * lease. Refreshes the lease if the requesting user already holds it or the
 * existing lease has expired.
 */
export async function acquireLock(
  db: PrismaClient | Prisma.TransactionClient,
  args: { resource: LockResource; userId: string; durationMs?: number },
): Promise<
  | { acquired: true; lock: AcquiredLock }
  | { acquired: false; heldBy: { userId: string; expiresAt: Date } }
> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + (args.durationMs ?? LEASE_DURATION_MS))

  return (db as PrismaClient).$transaction(async (tx) => {
    const existing = await tx.editingLock.findUnique({ where: { resource: args.resource } })
    if (existing && existing.expiresAt > now && existing.userId !== args.userId) {
      return { acquired: false as const, heldBy: { userId: existing.userId, expiresAt: existing.expiresAt } }
    }
    await tx.editingLock.upsert({
      where: { resource: args.resource },
      create: { resource: args.resource, userId: args.userId, expiresAt },
      update: { userId: args.userId, expiresAt },
    })
    return { acquired: true as const, lock: { resource: args.resource, userId: args.userId, expiresAt } }
  })
}

export async function releaseLock(
  db: PrismaClient | Prisma.TransactionClient,
  args: { resource: LockResource; userId: string },
) {
  await (db as PrismaClient).editingLock.deleteMany({
    where: { resource: args.resource, userId: args.userId },
  })
}
