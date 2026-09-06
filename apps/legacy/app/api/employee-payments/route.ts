import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { captureAccountingEvent } from "@/lib/accounting/integration"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { money, toNumberOrZero } from "@corelithzw/platform/money"
import { derivePaidStatus } from "@/lib/payroll/disbursements"
import { prisma } from "@corelithzw/db/client"

/**
 * What an employee was paid against a payroll run.
 *
 * This route used to be three routes wearing one coat. `type` could be `SALARY`,
 * `IRREGULAR` or a legacy `GOLD`; `payoutSource` narrowed the irregular case
 * four ways; `amount` was a `Float` read in whatever `unit` said, so a gold
 * payout stored **grams** here and carried its money in `amountUsd` alongside
 * three more gold columns. Reading it back meant asking `isLegacyGoldPaymentType`
 * what a row meant before you could add two of them up.
 *
 * Settlements own all of that. What is left is one kind of record: money paid to
 * one person for one payroll period, in one currency, at money's scale.
 */

const dateInputSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const employeePaymentCreateSchema = z.object({
  employeeId: z.string().uuid(),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
  dueDate: dateInputSchema,
  amount: z.number().nonnegative(),
  /// The currency. Named `unit` because the column is.
  unit: z.string().min(1).max(20),
  paidAmount: z.number().nonnegative().optional(),
  paidAt: dateInputSchema.optional(),
  status: z.enum(["DUE", "PARTIAL", "PAID"]).optional(),
  notes: z.string().max(2000).optional(),
})

/**
 * Reconciles a caller-supplied status with the numbers.
 *
 * A caller who says PAID gets `paidAmount` raised to the full amount rather than
 * a row that claims to be settled while showing a balance; a caller who says
 * PARTIAL but hands over everything (or nothing) gets the status the numbers
 * imply. The numbers win because they are what a payslip is struck on.
 */
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
  } else if (amount <= 0 || paidAmount <= 0 || paidAmount >= amount) {
    status = derivePaidStatus(amount, paidAmount)
    if (status === "PAID") paidAmount = amount
    if (status === "DUE") paidAmount = 0
  }

  return { amount, paidAmount, status }
}

const PAYMENT_INCLUDE = {
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
      status: true,
      period: { select: { id: true, periodKey: true } },
    },
  },
  disbursementBatch: { select: { id: true, code: true, status: true } },
} as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.compensation", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")
    const status = searchParams.get("status")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const search = searchParams.get("search")?.trim()
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      employee: { companyId: session.user.companyId },
    }
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
        ...((["DUE", "PARTIAL", "PAID"] as const).includes(
          normalizedSearch as "DUE" | "PARTIAL" | "PAID",
        )
          ? [{ status: normalizedSearch }]
          : []),
      ]
    }

    const [payments, total] = await Promise.all([
      prisma.employeePayment.findMany({
        where,
        include: PAYMENT_INCLUDE,
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
    const denial = hrPermissionDenial(session, "hr.compensation", "create")
    if (denial) return errorResponse(denial, 403)

    const validated = employeePaymentCreateSchema.parse(await request.json())

    const employee = await prisma.employee.findFirst({
      where: { id: validated.employeeId, companyId: session.user.companyId },
      select: { id: true, name: true },
    })
    if (!employee) {
      return errorResponse("Employee not found", 404)
    }

    const periodStart = new Date(validated.periodStart)
    const periodEnd = new Date(validated.periodEnd)
    if (periodEnd < periodStart) {
      return errorResponse("The period ends before it starts", 400)
    }

    const normalized = normalizePaymentState({
      amount: validated.amount,
      paidAmount: validated.paidAmount,
      status: validated.status,
    })

    const created = await prisma.employeePayment.create({
      data: {
        employeeId: validated.employeeId,
        periodStart,
        periodEnd,
        dueDate: new Date(validated.dueDate),
        amount: money(normalized.amount),
        unit: validated.unit.trim().toUpperCase(),
        paidAmount: normalized.paidAmount > 0 ? money(normalized.paidAmount) : null,
        paidAt:
          normalized.paidAmount > 0
            ? validated.paidAt
              ? new Date(validated.paidAt)
              : new Date()
            : null,
        status: normalized.status,
        notes: validated.notes?.trim() || undefined,
        createdById: session.user.id,
      },
      include: PAYMENT_INCLUDE,
    })

    // Only a payment that actually moved money is an accounting event.
    if (normalized.paidAmount > 0) {
      try {
        await captureAccountingEvent({
          companyId: session.user.companyId,
          sourceDomain: "employee-payments",
          sourceAction: "payment-recorded",
          sourceType: "PAYROLL_DISBURSEMENT",
          sourceId: created.id,
          entryDate: created.paidAt ?? created.createdAt,
          description: `Employee payment for ${employee.name}`,
          amount: toNumberOrZero(created.amount),
          payload: {
            employeeId: created.employeeId,
            currency: created.unit,
            status: created.status,
            paidAmount: toNumberOrZero(created.paidAmount),
          },
          createdById: session.user.id,
          status: "PENDING",
        })
      } catch (error) {
        // Accounting is optional — a payroll-only tenant has no ledger, and the
        // payment is already recorded either way.
        console.error("[Accounting] Employee payment capture failed:", error)
      }
    }

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/employee-payments error:", error)
    return errorResponse("Failed to create the employee payment")
  }
}
