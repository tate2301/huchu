/**
 * Period-close witness tests — Epic 9b.
 *
 * Requires a real Postgres test DB (DATABASE_URL_TEST or DATABASE_URL).
 * Run: npx vitest run lib/gold/period-close
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { assertPeriodOpen, PeriodClosedError } from "@/lib/gold/period-close"
import { factories } from "@/lib/gold/test-factories"
import type { UserRole } from "@prisma/client"

let companyId: string
let siteId: string
let closedById: string

function utcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

beforeAll(async () => {
  await prisma.$connect()
  const co = await prisma.company.create({ data: factories.company() })
  companyId = co.id
  const si = await prisma.site.create({ data: factories.site(companyId) })
  siteId = si.id
  const u = await prisma.user.create({ data: { ...factories.user(companyId), role: "MANAGER" as UserRole } })
  closedById = u.id
})

afterAll(async () => {
  await prisma.goldPeriodClose.deleteMany({ where: { companyId } })
  await prisma.user.deleteMany({ where: { companyId } })
  await prisma.site.delete({ where: { id: siteId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.$disconnect()
})

describe("GoldPeriodClose — creation", () => {
  it("creates a period close row", async () => {
    const start = utcMidnight(2026, 1, 1)
    const end = utcMidnight(2026, 2, 1)

    const row = await prisma.goldPeriodClose.create({
      data: { companyId, siteId, periodStart: start, periodEnd: end, closedById },
    })

    expect(row.id).toBeTruthy()
    expect(row.overrideAt).toBeNull()

    await prisma.goldPeriodClose.delete({ where: { id: row.id } })
  })

  it("rejects a duplicate (same companyId, siteId, periodStart) with unique constraint", async () => {
    const start = utcMidnight(2026, 3, 1)
    const end = utcMidnight(2026, 4, 1)

    const row = await prisma.goldPeriodClose.create({
      data: { companyId, siteId, periodStart: start, periodEnd: end, closedById },
    })

    await expect(
      prisma.goldPeriodClose.create({
        data: { companyId, siteId, periodStart: start, periodEnd: end, closedById },
      }),
    ).rejects.toThrow()

    await prisma.goldPeriodClose.delete({ where: { id: row.id } })
  })
})

describe("assertPeriodOpen", () => {
  it("allows dates outside the closed window", async () => {
    const start = utcMidnight(2026, 4, 1)
    const end = utcMidnight(2026, 5, 1)

    const row = await prisma.goldPeriodClose.create({
      data: { companyId, siteId, periodStart: start, periodEnd: end, closedById },
    })

    // Before window
    await expect(
      assertPeriodOpen(prisma, {
        companyId,
        siteId,
        businessDate: utcMidnight(2026, 3, 31),
      }),
    ).resolves.toBeUndefined()

    // After window (periodEnd is exclusive)
    await expect(
      assertPeriodOpen(prisma, {
        companyId,
        siteId,
        businessDate: utcMidnight(2026, 5, 1),
      }),
    ).resolves.toBeUndefined()

    await prisma.goldPeriodClose.delete({ where: { id: row.id } })
  })

  it("rejects dates inside the closed window with PeriodClosedError", async () => {
    const start = utcMidnight(2026, 6, 1)
    const end = utcMidnight(2026, 7, 1)

    const row = await prisma.goldPeriodClose.create({
      data: { companyId, siteId, periodStart: start, periodEnd: end, closedById },
    })

    const businessDate = utcMidnight(2026, 6, 15)
    await expect(
      assertPeriodOpen(prisma, { companyId, siteId, businessDate }),
    ).rejects.toThrow(PeriodClosedError)

    await prisma.goldPeriodClose.delete({ where: { id: row.id } })
  })

  it("matches a company-wide close (siteId: null) for any site", async () => {
    const start = utcMidnight(2026, 8, 1)
    const end = utcMidnight(2026, 9, 1)

    const row = await prisma.goldPeriodClose.create({
      data: { companyId, siteId: null, periodStart: start, periodEnd: end, closedById },
    })

    await expect(
      assertPeriodOpen(prisma, {
        companyId,
        siteId,
        businessDate: utcMidnight(2026, 8, 15),
      }),
    ).rejects.toThrow(PeriodClosedError)

    await prisma.goldPeriodClose.delete({ where: { id: row.id } })
  })

  it("allows dates inside a closed window that has been overridden", async () => {
    const start = utcMidnight(2026, 10, 1)
    const end = utcMidnight(2026, 11, 1)

    const row = await prisma.goldPeriodClose.create({
      data: {
        companyId,
        siteId,
        periodStart: start,
        periodEnd: end,
        closedById,
        overrideAt: new Date(),
        overrideById: closedById,
        overrideReason: "SUPERADMIN override for test",
      },
    })

    await expect(
      assertPeriodOpen(prisma, {
        companyId,
        siteId,
        businessDate: utcMidnight(2026, 10, 15),
      }),
    ).resolves.toBeUndefined()

    await prisma.goldPeriodClose.delete({ where: { id: row.id } })
  })

  it("re-closing after override (new row) blocks the period again", async () => {
    const start = utcMidnight(2026, 12, 1)
    const end = utcMidnight(2027, 1, 1)

    const overridden = await prisma.goldPeriodClose.create({
      data: {
        companyId,
        siteId,
        periodStart: start,
        periodEnd: end,
        closedById,
        overrideAt: new Date(),
        overrideById: closedById,
        overrideReason: "Overridden for re-close test",
      },
    })

    // Override lets it through
    await expect(
      assertPeriodOpen(prisma, {
        companyId,
        siteId,
        businessDate: utcMidnight(2026, 12, 15),
      }),
    ).resolves.toBeUndefined()

    // Re-close with a different periodStart (unique constraint: companyId+siteId+periodStart)
    const reClose = await prisma.goldPeriodClose.create({
      data: {
        companyId,
        siteId,
        periodStart: utcMidnight(2026, 12, 2),
        periodEnd: end,
        closedById,
      },
    })

    // Now blocked again
    await expect(
      assertPeriodOpen(prisma, {
        companyId,
        siteId,
        businessDate: utcMidnight(2026, 12, 15),
      }),
    ).rejects.toThrow(PeriodClosedError)

    await prisma.goldPeriodClose.deleteMany({
      where: { id: { in: [overridden.id, reClose.id] } },
    })
  })
})
