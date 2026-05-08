import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { getLatestGoldPriceSnapshot } from "@/lib/gold/valuation"

function startOfWeekUtc(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay() // 0=Sun
  // Treat Monday as start of week.
  const diff = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function dateKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const companyId = session.user.companyId

    const now = new Date()
    const weekStart = startOfWeekUtc(now)
    const weekEnd = addDays(weekStart, 7)
    const priorWeekStart = addDays(weekStart, -7)
    const priorWeekEnd = weekStart
    const trailing30Start = addDays(weekStart, -30)

    const siteScope = { companyId }

    const [
      thisWeekReceipts,
      priorWeekReceipts,
      thisWeekPours,
      priorWeekPours,
      undispatchedAndUnsoldPours,
      workerSharesUnpaid,
      dailyPours30,
      poursBySite30,
      recentReceipts,
      topEarners30,
    ] = await Promise.all([
      // Cash this week
      prisma.buyerReceipt.findMany({
        where: {
          receiptDate: { gte: weekStart, lt: weekEnd },
          OR: [
            { goldPour: { is: { site: siteScope } } },
            { goldDispatch: { is: { goldPour: { site: siteScope } } } },
          ],
        },
        select: { paidValueUsd: true, paidAmount: true },
      }),
      // Cash prior week
      prisma.buyerReceipt.findMany({
        where: {
          receiptDate: { gte: priorWeekStart, lt: priorWeekEnd },
          OR: [
            { goldPour: { is: { site: siteScope } } },
            { goldDispatch: { is: { goldPour: { site: siteScope } } } },
          ],
        },
        select: { paidValueUsd: true, paidAmount: true },
      }),
      // Production this week
      prisma.goldPour.findMany({
        where: {
          site: siteScope,
          pourDate: { gte: weekStart, lt: weekEnd },
        },
        select: { grossWeight: true },
      }),
      // Production prior week
      prisma.goldPour.findMany({
        where: {
          site: siteScope,
          pourDate: { gte: priorWeekStart, lt: priorWeekEnd },
        },
        select: { grossWeight: true },
      }),
      // Awaiting sale: pours with no receipt (direct or via dispatch)
      prisma.goldPour.findMany({
        where: {
          site: siteScope,
          receipts: { none: {} },
          dispatches: { every: { buyerReceipts: { none: {} } } },
        },
        select: { grossWeight: true, valueUsd: true },
      }),
      // Worker share owed (approved allocations) minus paid employee payments
      prisma.goldShiftWorkerShare.findMany({
        where: {
          allocation: {
            site: siteScope,
            workflowStatus: "APPROVED",
          },
        },
        select: { shareValueUsd: true, shareWeight: true },
      }),
      // Daily production trailing 30 days
      prisma.goldPour.findMany({
        where: {
          site: siteScope,
          pourDate: { gte: trailing30Start, lt: weekEnd },
        },
        select: { pourDate: true, grossWeight: true, valueUsd: true },
        orderBy: { pourDate: "asc" },
      }),
      // Production by site, last 30 days
      prisma.goldPour.findMany({
        where: {
          site: siteScope,
          pourDate: { gte: trailing30Start, lt: weekEnd },
        },
        select: {
          grossWeight: true,
          site: { select: { id: true, name: true, code: true } },
        },
      }),
      // Recent sales
      prisma.buyerReceipt.findMany({
        where: {
          OR: [
            { goldPour: { is: { site: siteScope } } },
            { goldDispatch: { is: { goldPour: { site: siteScope } } } },
          ],
        },
        orderBy: { receiptDate: "desc" },
        take: 5,
        select: {
          id: true,
          receiptNumber: true,
          receiptDate: true,
          paidValueUsd: true,
          paidAmount: true,
          paymentMethod: true,
          goldPour: {
            select: {
              pourBarId: true,
              site: { select: { name: true } },
            },
          },
          goldDispatch: {
            select: {
              goldPour: {
                select: {
                  pourBarId: true,
                  site: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      // Top earners last 30d (workers with highest total share)
      prisma.goldShiftWorkerShare.groupBy({
        by: ["employeeId"],
        where: {
          allocation: {
            site: siteScope,
            date: { gte: trailing30Start, lt: weekEnd },
          },
        },
        _sum: { shareValueUsd: true, shareWeight: true },
        orderBy: { _sum: { shareValueUsd: "desc" } },
        take: 5,
      }),
    ])

    const sumPaidUsd = (rows: Array<{ paidValueUsd: number | null; paidAmount: number }>) =>
      rows.reduce((sum, row) => sum + (row.paidValueUsd ?? row.paidAmount ?? 0), 0)

    const sumWeight = (rows: Array<{ grossWeight: number }>) =>
      rows.reduce((sum, row) => sum + row.grossWeight, 0)

    const cashThisWeekUsd = sumPaidUsd(thisWeekReceipts)
    const cashPriorWeekUsd = sumPaidUsd(priorWeekReceipts)
    const producedThisWeekGrams = sumWeight(thisWeekPours)
    const producedPriorWeekGrams = sumWeight(priorWeekPours)

    const latestPrice = await getLatestGoldPriceSnapshot(companyId)
    const spotUsdPerGram = latestPrice?.goldPriceUsdPerGram ?? null

    const awaitingSaleGrams = undispatchedAndUnsoldPours.reduce(
      (sum, pour) => sum + pour.grossWeight,
      0,
    )
    const awaitingSaleUsd = undispatchedAndUnsoldPours.reduce((sum, pour) => {
      if (pour.valueUsd != null) return sum + pour.valueUsd
      if (spotUsdPerGram != null) return sum + pour.grossWeight * spotUsdPerGram
      return sum
    }, 0)

    const owedToWorkersUsd = workerSharesUnpaid.reduce((sum, share) => {
      if (share.shareValueUsd != null) return sum + share.shareValueUsd
      if (spotUsdPerGram != null) return sum + share.shareWeight * spotUsdPerGram
      return sum
    }, 0)

    // Daily production series — fill 30-day window with zeros for missing days.
    const dailyMap = new Map<string, { grams: number; usd: number }>()
    for (let i = 0; i < 37; i += 1) {
      const day = addDays(trailing30Start, i)
      if (day >= weekEnd) break
      dailyMap.set(dateKeyUtc(day), { grams: 0, usd: 0 })
    }
    for (const pour of dailyPours30) {
      const key = dateKeyUtc(pour.pourDate)
      const entry = dailyMap.get(key)
      if (!entry) continue
      entry.grams += pour.grossWeight
      entry.usd += pour.valueUsd ?? 0
    }
    const dailyProductionSeries = Array.from(dailyMap.entries()).map(
      ([date, { grams, usd }]) => ({ date, grams, usd }),
    )

    // Production by site
    const siteMap = new Map<string, { id: string; name: string; code: string; grams: number }>()
    for (const pour of poursBySite30) {
      const id = pour.site.id
      const existing = siteMap.get(id) ?? {
        id,
        name: pour.site.name,
        code: pour.site.code,
        grams: 0,
      }
      existing.grams += pour.grossWeight
      siteMap.set(id, existing)
    }
    const productionBySite = Array.from(siteMap.values()).sort((a, b) => b.grams - a.grams)

    // Recent sales: normalize batch info
    const recentSales = recentReceipts.map((receipt) => {
      const pour = receipt.goldPour ?? receipt.goldDispatch?.goldPour
      return {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receiptDate: receipt.receiptDate,
        paidUsd: receipt.paidValueUsd ?? receipt.paidAmount,
        paymentMethod: receipt.paymentMethod,
        batchCode: pour?.pourBarId ?? "—",
        siteName: pour?.site.name ?? "—",
      }
    })

    // Top earners: hydrate employee names
    const topEmployeeIds = topEarners30.map((row) => row.employeeId)
    const topEmployees = topEmployeeIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: topEmployeeIds } },
          select: { id: true, name: true, employeeId: true },
        })
      : []
    const employeeMap = new Map(topEmployees.map((e) => [e.id, e]))
    const topEarners = topEarners30.map((row) => {
      const employee = employeeMap.get(row.employeeId)
      return {
        employeeId: row.employeeId,
        name: employee?.name ?? "Unknown",
        code: employee?.employeeId ?? null,
        valueUsd: row._sum.shareValueUsd ?? 0,
        weightGrams: row._sum.shareWeight ?? 0,
      }
    })

    return successResponse({
      generatedAt: now.toISOString(),
      weekStart: weekStart.toISOString(),
      kpis: {
        cashThisWeekUsd,
        cashPriorWeekUsd,
        producedThisWeekGrams,
        producedPriorWeekGrams,
        awaitingSaleGrams,
        awaitingSaleUsd,
        owedToWorkersUsd,
        spotUsdPerGram,
      },
      dailyProductionSeries,
      productionBySite,
      recentSales,
      topEarners,
    })
  } catch (error) {
    console.error("[API] GET /api/gold/summary error:", error)
    return errorResponse("Failed to load gold summary")
  }
}
