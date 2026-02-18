import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import {
  buildGoldPayoutNotes,
  extractAllocationIdFromPayoutNotes,
} from "@/lib/gold-payouts"
import { derivePaidStatus } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const dateInputSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const employeePaymentCreateSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(["GOLD", "SALARY"]),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
  dueDate: dateInputSchema,
  amount: z.number().nonnegative(),
  unit: z.string().min(1).max(20),
  paidAmount: z.number().nonnegative().optional(),
  paidAt: dateInputSchema.optional(),
  status: z.enum(["DUE", "PARTIAL", "PAID"]).optional(),
  notes: z.string().max(2000).optional(),
})

function normalizePaymentState(input: {
  amount: number
  paidAmount?: number
  status?: "DUE" | "PARTIAL" | "PAID"
}) {
  const amount = Math.max(input.amount, 0)
  let paidAmount = input.paidAmount ?? 0
  let status = input.status ?? derivePaidStatus(amount, paidAmount)

  if (status === "PAID") {
    paidAmount = amount
  } else if (status === "DUE") {
    paidAmount = 0
  } else if (status === "PARTIAL") {
    if (amount <= 0 || paidAmount <= 0 || paidAmount >= amount) {
      status = derivePaidStatus(amount, paidAmount)
    }
  }

  status = derivePaidStatus(amount, paidAmount)

  return {
    status,
    paidAmount: paidAmount > 0 ? paidAmount : null,
  }
}

type GoldAllocationResolution =
  | {
      allocationId: string
      workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"
    }
  | {
      error: string
      status: number
    }

function fullDayRange(startInput: string, endInput: string) {
  const start = new Date(startInput)
  const end = new Date(endInput)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  if (start.getTime() > end.getTime()) {
    return { start: end, end: start }
  }
  return { start, end }
}

async function resolveGoldAllocationForPayment(input: {
  companyId: string
  employeeId: string
  periodStart: string
  periodEnd: string
  notes?: string | null
}): Promise<GoldAllocationResolution> {
  const linkedAllocationId = extractAllocationIdFromPayoutNotes(input.notes)
  if (linkedAllocationId) {
    const linked = await prisma.goldShiftAllocation.findUnique({
      where: { id: linkedAllocationId },
      select: {
        id: true,
        workflowStatus: true,
        site: { select: { companyId: true } },
        workerShares: {
          where: { employeeId: input.employeeId },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!linked || linked.site.companyId !== input.companyId) {
      return {
        error: "Linked gold shift allocation was not found for this company",
        status: 404,
      }
    }
    if (linked.workerShares.length === 0) {
      return {
        error: "Linked allocation does not include the selected employee",
        status: 400,
      }
    }
    return { allocationId: linked.id, workflowStatus: linked.workflowStatus }
  }

  const range = fullDayRange(input.periodStart, input.periodEnd)
  if (!range) {
    return {
      error: "Invalid payment period for gold payout linkage",
      status: 400,
    }
  }

  const candidates = await prisma.goldShiftAllocation.findMany({
    where: {
      site: { companyId: input.companyId },
      workerShares: { some: { employeeId: input.employeeId } },
      date: {
        gte: range.start,
        lte: range.end,
      },
    },
    select: {
      id: true,
      workflowStatus: true,
    },
    orderBy: { date: "desc" },
    take: 2,
  })

  if (candidates.length === 0) {
    return {
      error: "Gold payouts must be linked to a shift allocation for this worker and period",
      status: 400,
    }
  }

  if (candidates.length > 1) {
    return {
      error:
        "Multiple shift allocations match this payout period. Use allocation-linked notes to target one allocation.",
      status: 409,
    }
  }

  return {
    allocationId: candidates[0].id,
    workflowStatus: candidates[0].workflowStatus,
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const employeeId = searchParams.get("employeeId")
    const status = searchParams.get("status")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const search = searchParams.get("search")?.trim()
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      employee: { companyId: session.user.companyId },
    }

    if (type) where.type = type
    if (employeeId) where.employeeId = employeeId
    if (status) where.status = status
    if (startDate) where.periodStart = { gte: new Date(startDate) }
    if (endDate) where.periodEnd = { lte: new Date(endDate) }
    if (search) {
      const normalizedSearch = search.toUpperCase()
      where.OR = [
        { notes: { contains: search, mode: "insensitive" } },
        { unit: { contains: search, mode: "insensitive" } },
        { employee: { name: { contains: search, mode: "insensitive" } } },
        { employee: { employeeId: { contains: search, mode: "insensitive" } } },
        ...(normalizedSearch === "GOLD" || normalizedSearch === "SALARY"
          ? [{ type: normalizedSearch }]
          : []),
        ...((
          ["DUE", "PARTIAL", "PAID"] as const
        ).includes(normalizedSearch as "DUE" | "PARTIAL" | "PAID")
          ? [{ status: normalizedSearch }]
          : []),
      ]
    }

    const [payments, total] = await Promise.all([
      prisma.employeePayment.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              position: true,
              isActive: true,
            },
          },
          createdBy: { select: { id: true, name: true } },
          payrollRun: {
            select: {
              id: true,
              runNumber: true,
              domain: true,
              status: true,
              period: { select: { id: true, periodKey: true } },
            },
          },
          disbursementBatch: {
            select: {
              id: true,
              code: true,
              status: true,
            },
          },
        },
        orderBy: { periodEnd: "desc" },
        skip,
        take: limit,
      }),
      prisma.employeePayment.count({ where }),
    ])

    return successResponse(paginationResponse(payments, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/employee-payments error:", error)
    return errorResponse("Failed to fetch employee payments")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = employeePaymentCreateSchema.parse(body)

    const employee = await prisma.employee.findUnique({
      where: { id: validated.employeeId },
      select: { companyId: true, isActive: true },
    })
    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }

    let notes = validated.notes
    if (validated.type === "GOLD") {
      const allocationResolution = await resolveGoldAllocationForPayment({
        companyId: session.user.companyId,
        employeeId: validated.employeeId,
        periodStart: validated.periodStart,
        periodEnd: validated.periodEnd,
        notes: validated.notes,
      })

      if ("error" in allocationResolution) {
        return errorResponse(allocationResolution.error, allocationResolution.status)
      }
      if (allocationResolution.workflowStatus !== "APPROVED") {
        return errorResponse(
          "Gold payout allocation must be approved before recording payouts",
          409,
        )
      }

      notes = buildGoldPayoutNotes(allocationResolution.allocationId, validated.notes)
    }

    const normalized = normalizePaymentState({
      amount: validated.amount,
      paidAmount: validated.paidAmount,
      status: validated.status,
    })

    const paidAt =
      normalized.paidAmount && normalized.paidAmount > 0
        ? validated.paidAt
          ? new Date(validated.paidAt)
          : new Date()
        : null

    const payment = await prisma.employeePayment.create({
      data: {
        employeeId: validated.employeeId,
        type: validated.type,
        periodStart: new Date(validated.periodStart),
        periodEnd: new Date(validated.periodEnd),
        dueDate: new Date(validated.dueDate),
        amount: validated.amount,
        unit: validated.unit,
        paidAmount: normalized.paidAmount,
        paidAt,
        status: normalized.status,
        notes,
        createdById: session.user.id,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            position: true,
            isActive: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        payrollRun: {
          select: {
            id: true,
            runNumber: true,
            domain: true,
            status: true,
            period: { select: { id: true, periodKey: true } },
          },
        },
        disbursementBatch: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
    })

    try {
      const shouldQueueForAccounting = payment.type === "SALARY"
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "employee-payments",
        sourceAction: "payment-created",
        sourceType: shouldQueueForAccounting ? "PAYROLL_DISBURSEMENT" : undefined,
        sourceId: payment.id,
        entryDate: payment.createdAt,
        description: `${payment.type} employee payment recorded`,
        amount: payment.amount,
        payload: {
          employeeId: payment.employeeId,
          type: payment.type,
          status: payment.status,
          payrollRunId: payment.payrollRun?.id ?? null,
          disbursementBatchId: payment.disbursementBatch?.id ?? null,
        },
        createdById: session.user.id,
        status: shouldQueueForAccounting ? "PENDING" : "IGNORED",
      })
    } catch (error) {
      console.error("[Accounting] Employee payment capture failed:", error)
    }

    return successResponse(payment, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/employee-payments error:", error)
    return errorResponse("Failed to create employee payment")
  }
}
