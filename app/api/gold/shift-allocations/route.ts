import { NextRequest, NextResponse } from "next/server"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import {
  AUTO_BATCH_NOTE_PREFIX,
  AUTO_PAYOUT_NOTE_PREFIX,
} from "@/lib/gold-payouts"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const expenseSchema = z.object({
  type: z.string().min(1).max(100),
  weight: z.number().min(0.0001),
})

const allocationSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  shift: z.enum(["DAY", "NIGHT"]),
  siteId: z.string().uuid(),
  totalWeight: z.number().positive(),
  expenses: z.array(expenseSchema).optional(),
  payCycleWeeks: z
    .number()
    .int()
    .refine((value) => value === 2 || value === 4, {
      message: "Pay cycle must be 2 or 4 weeks",
    }),
})

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0")
}

function buildBatchCodeCandidate() {
  const now = new Date()
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}${formatTwoDigits(now.getSeconds())}`
  const randomPart = Math.floor(100 + Math.random() * 900)
  return `BATCH-${datePart}-${timePart}-${randomPart}`
}

async function generateUniqueBatchCode(db: Pick<typeof prisma, "goldPour">) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildBatchCodeCandidate()
    const existing = await db.goldPour.findUnique({
      where: { pourBarId: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }

  return `BATCH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
}

function getDayRange(dateValue: string) {
  const start = new Date(dateValue)
  const end = new Date(dateValue)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const shift = searchParams.get("shift")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    }

    if (siteId) where.siteId = siteId
    if (shift === "DAY" || shift === "NIGHT") where.shift = shift
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.date = dateFilter
    }

    const [allocations, total] = await Promise.all([
      prisma.goldShiftAllocation.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          shiftReport: { select: { id: true, status: true, crewCount: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          expenses: { select: { id: true, type: true, weight: true } },
          workerShares: {
            select: {
              id: true,
              shareWeight: true,
              employee: { select: { id: true, name: true, employeeId: true } },
            },
          },
        },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.goldShiftAllocation.count({ where }),
    ])

    return successResponse(paginationResponse(allocations, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/gold/shift-allocations error:", error)
    return errorResponse("Failed to fetch shift allocations")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = allocationSchema.parse(body)

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true, isActive: true },
    })

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }

    if (!site.isActive) {
      return errorResponse("Site is not active", 400)
    }

    const { start, end } = getDayRange(validated.date)

    const shiftReport = await prisma.shiftReport.findFirst({
      where: {
        siteId: validated.siteId,
        shift: validated.shift,
        date: { gte: start, lt: end },
      },
      select: { id: true, status: true, crewCount: true },
    })

    if (!shiftReport) {
      return errorResponse("Shift report required before allocation", 400)
    }

    const existing = await prisma.goldShiftAllocation.findFirst({
      where: {
        siteId: validated.siteId,
        shift: validated.shift,
        date: { gte: start, lt: end },
      },
      select: { id: true },
    })

    if (existing) {
      return errorResponse("Shift allocation already exists for this shift", 409)
    }

    const attendance = await prisma.attendance.findMany({
      where: {
        siteId: validated.siteId,
        shift: validated.shift,
        date: { gte: start, lt: end },
        status: { in: ["PRESENT", "LATE"] },
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
      },
    })

    if (attendance.length === 0) {
      return errorResponse("No present workers found for this shift", 400)
    }

    const expenseTotal = (validated.expenses ?? []).reduce(
      (sum, expense) => sum + expense.weight,
      0,
    )
    const netWeight = validated.totalWeight - expenseTotal

    if (netWeight <= 0) {
      return errorResponse("Net weight must be positive after expenses", 400)
    }

    const workerShareWeight = netWeight / 2
    const companyShareWeight = netWeight / 2
    const perWorkerWeight = workerShareWeight / attendance.length

    const primaryWitnessId = attendance[0]?.employee.id
    let secondaryWitnessId = attendance.find(
      (record) => record.employee.id !== primaryWitnessId,
    )?.employee.id

    if (!secondaryWitnessId && primaryWitnessId) {
      const fallbackWitness = await prisma.employee.findFirst({
        where: {
          companyId: session.user.companyId,
          isActive: true,
          id: { not: primaryWitnessId },
        },
        select: { id: true },
      })
      secondaryWitnessId = fallbackWitness?.id
    }

    const canAutoCreateBatch = Boolean(primaryWitnessId && secondaryWitnessId)

    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.goldShiftAllocation.create({
        data: {
          date: start,
          shift: validated.shift,
          siteId: validated.siteId,
          shiftReportId: shiftReport.id,
          totalWeight: validated.totalWeight,
          netWeight,
          workerShareWeight,
          companyShareWeight,
          perWorkerWeight,
          payCycleWeeks: validated.payCycleWeeks,
          createdById: session.user.id,
          expenses: {
            create: (validated.expenses ?? []).map((expense) => ({
              type: expense.type,
              weight: expense.weight,
            })),
          },
          workerShares: {
            create: attendance.map((record) => ({
              employeeId: record.employee.id,
              shareWeight: perWorkerWeight,
            })),
          },
        },
        include: {
          site: { select: { name: true, code: true } },
          shiftReport: { select: { id: true, status: true, crewCount: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          expenses: { select: { id: true, type: true, weight: true } },
          workerShares: {
            select: {
              id: true,
              shareWeight: true,
              employee: { select: { id: true, name: true, employeeId: true } },
            },
          },
        },
      })

      const payoutDueDate = new Date(start)
      payoutDueDate.setDate(payoutDueDate.getDate() + validated.payCycleWeeks * 7)

      if (allocation.workerShares.length > 0) {
        await tx.employeePayment.createMany({
          data: allocation.workerShares.map((share) => ({
            employeeId: share.employee.id,
            type: "GOLD",
            periodStart: start,
            periodEnd: start,
            dueDate: payoutDueDate,
            amount: share.shareWeight,
            unit: "g",
            status: "DUE",
            notes: `${AUTO_PAYOUT_NOTE_PREFIX}${allocation.id}`,
            createdById: session.user.id,
          })),
        })
      }

      let createdBatchId: string | null = null
      let createdBatchCode: string | null = null

      if (canAutoCreateBatch && primaryWitnessId && secondaryWitnessId) {
        const batchCode = await generateUniqueBatchCode(tx)
        const batch = await tx.goldPour.create({
          data: {
            siteId: validated.siteId,
            pourBarId: batchCode,
            pourDate: start,
            grossWeight: netWeight,
            witness1Id: primaryWitnessId,
            witness2Id: secondaryWitnessId,
            storageLocation: "Shift Vault",
            notes: `${AUTO_BATCH_NOTE_PREFIX}${allocation.id}`,
          },
          select: { id: true, pourBarId: true },
        })
        createdBatchId = batch.id
        createdBatchCode = batch.pourBarId
      }

      return {
        allocation,
        createdBatchId,
        createdBatchCode,
        payoutRecordsCreated: allocation.workerShares.length,
      }
    })

    return successResponse(
      {
        ...result.allocation,
        createdBatchId: result.createdBatchId,
        createdBatchCode: result.createdBatchCode,
        payoutRecordsCreated: result.payoutRecordsCreated,
        warnings: canAutoCreateBatch
          ? []
          : [
              "Shift allocation was saved, but no auto batch was created because two witness employees were not available.",
            ],
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/shift-allocations error:", error)
    return errorResponse("Failed to record shift allocation")
  }
}
