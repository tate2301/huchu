import { NextRequest, NextResponse } from "next/server"
import {
  errorResponse,
  getPaginationParams,
  hasRole,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import { recordInventoryEvent } from "@/lib/gold/inventory"
import {
  AUTO_BATCH_NOTE_PREFIX,
  AUTO_PAYOUT_NOTE_PREFIX,
} from "@/lib/gold-payouts"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

function normalizeShiftLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}

const shiftLabelSchema = z
  .string()
  .trim()
  .min(1, "Shift is required")
  .max(50, "Shift must be 50 characters or less")
  .transform(normalizeShiftLabel)

const expenseSchema = z.object({
  type: z.string().trim().min(1).max(100),
  weight: z.number().min(0.0001),
})

const allocationSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  shift: shiftLabelSchema,
  siteId: z.string().uuid(),
  totalWeight: z.number().positive(),
  expenses: z.array(expenseSchema).optional(),
  splitMode: z.enum(["DEFAULT_50_50", "OVERRIDE_WORKER_WEIGHT"]).optional(),
  workerShareOverrideWeight: z.number().positive().optional(),
  splitOverrideReason: z.string().trim().max(500).optional(),
  payCycleWeeks: z
    .number()
    .int()
    .refine((value) => value === 2 || value === 4, {
      message: "Pay cycle must be 2 or 4 weeks",
    }),
}).refine(
  (value) =>
    value.splitMode !== "OVERRIDE_WORKER_WEIGHT" ||
    (typeof value.workerShareOverrideWeight === "number" &&
      value.workerShareOverrideWeight > 0 &&
      Boolean(value.splitOverrideReason?.trim())),
  {
    message: "Worker share weight and reason are required for manual split override",
    path: ["workerShareOverrideWeight"],
  },
)

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
    const workflowStatus = searchParams.get("workflowStatus")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (siteId) where.siteId = siteId
    if (shift?.trim()) where.shift = normalizeShiftLabel(shift)
    if (
      workflowStatus &&
      ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].includes(workflowStatus)
    ) {
      where.workflowStatus = workflowStatus
    }
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
              shareValueUsd: true,
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

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create shift allocations", 403)
    }

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
      select: { id: true, status: true, crewCount: true, shiftGroupId: true },
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

    if (!shiftReport.shiftGroupId) {
      console.warn(
        `[shift-allocations] shiftReport ${shiftReport.id} has no shiftGroupId — attendance will not be scoped by crew. Parallel crews on the same shift label may dilute each other's share.`,
      )
    }
    const attendance = await prisma.attendance.findMany({
      where: {
        siteId: validated.siteId,
        shift: validated.shift,
        date: { gte: start, lt: end },
        status: { in: ["PRESENT", "LATE"] },
        ...(shiftReport.shiftGroupId
          ? { shiftGroupId: shiftReport.shiftGroupId }
          : {}),
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
      },
    })

    if (attendance.length === 0) {
      return errorResponse("No present workers found for this shift", 400)
    }

    const requestedExpenseTypes = Array.from(
      new Set((validated.expenses ?? []).map((expense) => expense.type.trim().toLowerCase())),
    )
    if (requestedExpenseTypes.length > 0) {
      const configuredExpenseTypes = await prisma.goldExpenseType.findMany({
        where: {
          companyId: session.user.companyId,
          isActive: true,
        },
        select: { name: true },
      })
      const configuredTypeSet = new Set(
        configuredExpenseTypes.map((expenseType) => expenseType.name.trim().toLowerCase()),
      )
      const invalidTypes = requestedExpenseTypes.filter((type) => !configuredTypeSet.has(type))
      if (invalidTypes.length > 0) {
        return errorResponse("Invalid expense type. Update gold expense types in master data.", 400)
      }
    }

    const expenseTotal = (validated.expenses ?? []).reduce(
      (sum, expense) => sum + expense.weight,
      0,
    )
    const netWeight = validated.totalWeight - expenseTotal

    if (netWeight <= 0) {
      return errorResponse("Net weight must be positive after expenses", 400)
    }

    const splitMode = validated.splitMode ?? "DEFAULT_50_50"
    let workerShareWeight = netWeight / 2
    let companyShareWeight = netWeight / 2
    if (splitMode === "OVERRIDE_WORKER_WEIGHT") {
      const overrideWeight = validated.workerShareOverrideWeight ?? 0
      if (overrideWeight <= 0 || overrideWeight >= netWeight) {
        return errorResponse("Worker share override must be greater than 0 and less than net weight", 400)
      }
      workerShareWeight = overrideWeight
      companyShareWeight = netWeight - overrideWeight
    }
    const perWorkerWeight = workerShareWeight / attendance.length
    const valuationSnapshot = await snapshotGoldUsdValue({
      companyId: session.user.companyId,
      businessDate: start,
      grams: 1,
    })
    if (!valuationSnapshot) {
      return errorResponse("No gold price configured. Add a gold price before recording shift output.", 409)
    }
    const goldPriceUsdPerGram = valuationSnapshot.goldPriceUsdPerGram
    const valuationDate = valuationSnapshot.valuationDate
    const totalWeightValueUsd = Math.round(validated.totalWeight * goldPriceUsdPerGram * 100) / 100
    const netWeightValueUsd = Math.round(netWeight * goldPriceUsdPerGram * 100) / 100
    const workerShareValueUsd = Math.round(workerShareWeight * goldPriceUsdPerGram * 100) / 100
    const companyShareValueUsd = Math.round(companyShareWeight * goldPriceUsdPerGram * 100) / 100
    const perWorkerValueUsd = Math.round(perWorkerWeight * goldPriceUsdPerGram * 100) / 100

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
          companyId: session.user.companyId,
          date: start,
          shift: validated.shift,
          siteId: validated.siteId,
          shiftReportId: shiftReport.id,
          // Epic 3: denormalised from shiftReport so the widened
          // @@unique([siteId, date, shift, shiftGroupId]) can do its job.
          shiftGroupId: shiftReport.shiftGroupId ?? null,
          totalWeight: validated.totalWeight,
          netWeight,
          splitMode,
          workerShareOverrideWeight:
            splitMode === "OVERRIDE_WORKER_WEIGHT"
              ? validated.workerShareOverrideWeight
              : undefined,
          splitOverrideReason:
            splitMode === "OVERRIDE_WORKER_WEIGHT"
              ? validated.splitOverrideReason?.trim()
              : undefined,
          workerShareWeight,
          companyShareWeight,
          perWorkerWeight,
          goldPriceUsdPerGram,
          valuationDate,
          totalWeightValueUsd,
          netWeightValueUsd,
          workerShareValueUsd,
          companyShareValueUsd,
          perWorkerValueUsd,
          payCycleWeeks: validated.payCycleWeeks,
          createdById: session.user.id,
          expenses: {
            create: (validated.expenses ?? []).map((expense) => ({
              type: expense.type.trim(),
              weight: expense.weight,
            })),
          },
          workerShares: {
            create: attendance.map((record) => ({
              employeeId: record.employee.id,
              shareWeight: perWorkerWeight,
              shareValueUsd: perWorkerValueUsd,
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
              shareValueUsd: true,
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
            type: "IRREGULAR",
            payoutSource: "GOLD",
            periodStart: start,
            periodEnd: start,
            dueDate: payoutDueDate,
            amount: Number(share.shareWeight),
            amountUsd: share.shareValueUsd == null ? perWorkerValueUsd : Number(share.shareValueUsd),
            unit: "g",
            // share.shareWeight is Prisma.Decimal post Epic-6 — coerce.
            goldWeightGrams: Number(share.shareWeight),
            goldPriceUsdPerGram,
            valuationDate,
            status: "DUE",
            notes: `${AUTO_PAYOUT_NOTE_PREFIX}${allocation.id}`,
            goldShiftAllocationId: allocation.id,
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
            companyId: session.user.companyId,
            siteId: validated.siteId,
            pourBarId: batchCode,
            pourDate: start,
            grossWeight: validated.totalWeight,
            goldPriceUsdPerGram,
            valuationDate,
            valueUsd: totalWeightValueUsd,
            witness1Id: primaryWitnessId,
            witness2Id: secondaryWitnessId,
            storageLocation: "Shift Vault",
            notes: `${AUTO_BATCH_NOTE_PREFIX}${allocation.id}`,
            createdById: session.user.id,
            goldShiftAllocationId: allocation.id,
          },
          select: { id: true, pourBarId: true },
        })
        createdBatchId = batch.id
        createdBatchCode = batch.pourBarId

        // The pour represents on-prem gold. Mirror the pour-route behaviour
        // here since the auto-pour bypasses the API.
        await recordInventoryEvent(tx, {
          companyId: session.user.companyId,
          siteId: validated.siteId,
          eventDate: start,
          direction: "IN",
          grams: validated.totalWeight,
          goldPriceUsdPerGram,
          valueUsd: totalWeightValueUsd,
          sourceType: "POUR",
          sourceId: batch.id,
          notes: `Auto pour ${batch.pourBarId} from allocation ${allocation.id}`,
          createdById: session.user.id,
          skipValuation: true,
        })
      }

      return {
        allocation,
        createdBatchId,
        createdBatchCode,
        payoutRecordsCreated: allocation.workerShares.length,
      }
    })

    // Mdara (company share), Boys (worker share), and per-expense events.
    // PENDING status so default posting rules can pick them up.
    try {
      const allocation = result.allocation
      const sharedPayload = {
        allocationId: allocation.id,
        siteId: allocation.siteId,
        shift: allocation.shift,
        date: allocation.date,
        goldPriceUsdPerGram: allocation.goldPriceUsdPerGram,
        valuationDate: allocation.valuationDate,
      }

      // Mdara
      if (Number(allocation.companyShareWeight) > 0) {
        await captureAccountingEvent({
          companyId: session.user.companyId,
          sourceDomain: "gold",
          sourceAction: "shift-allocation-company-share",
          sourceType: "GOLD_SHIFT_ALLOCATION_COMPANY",
          sourceId: allocation.id,
          entryDate: allocation.date,
          description: `Gold company share (Mdara) — allocation ${allocation.id}`,
          amount: allocation.companyShareValueUsd != null ? Number(allocation.companyShareValueUsd) : Number(allocation.companyShareWeight),
          netAmount: allocation.companyShareValueUsd != null ? Number(allocation.companyShareValueUsd) : undefined,
          grossAmount: allocation.companyShareValueUsd != null ? Number(allocation.companyShareValueUsd) : undefined,
          payload: {
            ...sharedPayload,
            shareWeight: Number(allocation.companyShareWeight),
            shareValueUsd: allocation.companyShareValueUsd != null ? Number(allocation.companyShareValueUsd) : null,
          },
          createdById: session.user.id,
          status: "PENDING",
        })
      }

      // Boys
      if (Number(allocation.workerShareWeight) > 0) {
        await captureAccountingEvent({
          companyId: session.user.companyId,
          sourceDomain: "gold",
          sourceAction: "shift-allocation-worker-share",
          sourceType: "GOLD_SHIFT_ALLOCATION_WORKER",
          sourceId: allocation.id,
          entryDate: allocation.date,
          description: `Gold worker share (Boys) — allocation ${allocation.id}`,
          amount: allocation.workerShareValueUsd != null ? Number(allocation.workerShareValueUsd) : Number(allocation.workerShareWeight),
          netAmount: allocation.workerShareValueUsd != null ? Number(allocation.workerShareValueUsd) : undefined,
          grossAmount: allocation.workerShareValueUsd != null ? Number(allocation.workerShareValueUsd) : undefined,
          payload: {
            ...sharedPayload,
            shareWeight: Number(allocation.workerShareWeight),
            shareValueUsd: allocation.workerShareValueUsd != null ? Number(allocation.workerShareValueUsd) : null,
            payoutRecordsCreated: result.payoutRecordsCreated,
          },
          createdById: session.user.id,
          status: "PENDING",
        })
      }

      // Per-expense
      const goldPrice = allocation.goldPriceUsdPerGram != null ? Number(allocation.goldPriceUsdPerGram) : 0
      for (const expense of allocation.expenses) {
        const expenseValueUsd = goldPrice
          ? Math.round(Number(expense.weight) * goldPrice * 100) / 100
          : null
        await captureAccountingEvent({
          companyId: session.user.companyId,
          sourceDomain: "gold",
          sourceAction: "shift-expense",
          sourceType: "GOLD_SHIFT_EXPENSE",
          sourceId: expense.id,
          entryDate: allocation.date,
          description: `Gold shift expense (${expense.type}) — allocation ${allocation.id}`,
          amount: expenseValueUsd ?? Number(expense.weight),
          netAmount: expenseValueUsd ?? undefined,
          grossAmount: expenseValueUsd ?? undefined,
          payload: {
            ...sharedPayload,
            expenseId: expense.id,
            expenseType: expense.type,
            weight: Number(expense.weight),
            valueUsd: expenseValueUsd,
          },
          createdById: session.user.id,
          status: "PENDING",
        })
      }
    } catch (error) {
      console.error("[Accounting] Gold shift allocation 3-way capture failed:", error)
    }

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
