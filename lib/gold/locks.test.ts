import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { acquireLock, releaseLock } from "@/lib/gold/locks"
import { factories } from "@/lib/gold/test-factories"
import type { UserRole } from "@prisma/client"

let userId1: string
let userId2: string
let testPrefix: string

beforeAll(async () => {
  await prisma.$connect()
  const co = await prisma.company.create({ data: factories.company() })
  const u1Data = factories.user(co.id)
  const u2Data = factories.user(co.id)
  const u1 = await prisma.user.create({ data: { ...u1Data, role: u1Data.role as UserRole } })
  const u2 = await prisma.user.create({ data: { ...u2Data, role: u2Data.role as UserRole } })
  userId1 = u1.id
  userId2 = u2.id
  testPrefix = `import:test-${crypto.randomUUID()}`
})

afterAll(async () => {
  await prisma.editingLock.deleteMany({ where: { resource: { startsWith: "import:test-" } } })
  await prisma.$disconnect()
})

function res(suffix: string) {
  return `${testPrefix}-${suffix}`
}

describe("acquireLock", () => {
  it("returns acquired:true when the resource is free", async () => {
    const result = await acquireLock(prisma, { resource: res("free"), userId: userId1 })
    expect(result.acquired).toBe(true)
    if (result.acquired) {
      expect(result.lock.userId).toBe(userId1)
      expect(result.lock.expiresAt).toBeInstanceOf(Date)
    }
  })

  it("same user can re-acquire (refreshes expiry)", async () => {
    const r = res("refresh")
    const first = await acquireLock(prisma, { resource: r, userId: userId1 })
    expect(first.acquired).toBe(true)

    const second = await acquireLock(prisma, { resource: r, userId: userId1, durationMs: 10 * 60 * 1000 })
    expect(second.acquired).toBe(true)
    if (first.acquired && second.acquired) {
      expect(second.lock.expiresAt.getTime()).toBeGreaterThan(first.lock.expiresAt.getTime())
    }
  })

  it("different user is rejected while existing lease is unexpired", async () => {
    const r = res("blocked")
    await acquireLock(prisma, { resource: r, userId: userId1, durationMs: 60_000 })

    const result = await acquireLock(prisma, { resource: r, userId: userId2 })
    expect(result.acquired).toBe(false)
    if (!result.acquired) {
      expect(result.heldBy.userId).toBe(userId1)
    }
  })

  it("different user can acquire after the lease expires", async () => {
    const r = res("expired")
    await acquireLock(prisma, { resource: r, userId: userId1, durationMs: 1 })
    await prisma.editingLock.update({
      where: { resource: r },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const result = await acquireLock(prisma, { resource: r, userId: userId2 })
    expect(result.acquired).toBe(true)
    if (result.acquired) {
      expect(result.lock.userId).toBe(userId2)
    }
  })
})

describe("releaseLock", () => {
  it("is idempotent — releasing a lock that does not exist does not throw", async () => {
    const freeResource = res("idempotent-free")
    await expect(releaseLock(prisma, { resource: freeResource, userId: userId1 })).resolves.toBeUndefined()
  })

  it("releases a held lock so another user can acquire it", async () => {
    const r = res("release-transfer")
    await acquireLock(prisma, { resource: r, userId: userId1, durationMs: 60_000 })
    await releaseLock(prisma, { resource: r, userId: userId1 })

    const result = await acquireLock(prisma, { resource: r, userId: userId2 })
    expect(result.acquired).toBe(true)
  })

  it("does not release a lock held by a different user", async () => {
    const r = res("no-cross-release")
    await acquireLock(prisma, { resource: r, userId: userId1, durationMs: 60_000 })
    await releaseLock(prisma, { resource: r, userId: userId2 })

    const lock = await prisma.editingLock.findUnique({ where: { resource: r } })
    expect(lock?.userId).toBe(userId1)
  })
})
