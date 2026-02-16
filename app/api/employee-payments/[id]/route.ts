import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import {
  buildGoldPayoutNotes,
  extractAllocationIdFromPayoutNotes,
} from "@/lib/gold-payouts"
import { derivePaidStatus } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const dateInputSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const updateEmployeePaymentSchema = z.object({
  periodStart: dateInputSchema.optional(),
  periodEnd: dateInputSchema.optional(),
  dueDate: dateInputSchema.optional(),
  amount: z.number().nonnegative().optional(),
  unit: z.string().min(1).max(20).optional(),
  paidAmount: z.number().nonnegative().nullable().optional(),
  paidAt: dateInputSchema.nullable().optional(),
  status: z.enum(["DUE", "PARTIAL", "PAID"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
})

type RouteParams = {
  params: Promise<{ id: string }>
}

function normalizePaymentState(input: {
  amount: number
  paidAmount: number
  status?: "DUE" | "PARTIAL" | "PAID"
}) {
  let paidAmount = Math.max(input.paidAmount, 0)
  const amount = Math.max(input.amount, 0)

  if (input.status === "PAID") {
    paidAmount = amount
  } else if (input.status === "DUE") {
    paidAmount = 0
  }

  const status = derivePaidStatus(amount, paidAmount)
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const body = await request.json()
    const validated = updateEmployeePaymentSchema.parse(body)

    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400)
    }

    const existing = await prisma.employeePayment.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        employeeId: true,
        periodStart: true,
        periodEnd: true,
        notes: true,
        amount: true,
        status: true,
        paidAmount: true,
        paidAt: true,
        payrollRunId: true,
        payrollLineItemId: true,
        disbursementBatchId: true,
        disbursementItemId: true,
        employee: { select: { companyId: true } },
      },
    })

    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Employee payment not found", 404)
    }

    if (
      existing.payrollRunId ||
      existing.payrollLineItemId ||
      existing.disbursementBatchId ||
      existing.disbursementItemId
    ) {
      return errorResponse(
        "This payment is linked to payroll/disbursement workflows and cannot be edited manually.",
        409,
      )
    }

    let normalizedGoldNotes: string | null | undefined
    if (existing.type === "GOLD") {
      const nextPeriodStart = validated.periodStart ?? existing.periodStart.toISOString()
      const nextPeriodEnd = validated.periodEnd ?? existing.periodEnd.toISOString()
      const nextNotes =
        validated.notes !== undefined ? validated.notes : (existing.notes ?? undefined)

      const allocationResolution = await resolveGoldAllocationForPayment({
        companyId: session.user.companyId,
        employeeId: existing.employeeId,
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        notes: nextNotes,
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

      normalizedGoldNotes = buildGoldPayoutNotes(allocationResolution.allocationId, nextNotes)
    }

    const nextAmount = validated.amount ?? existing.amount
    let nextPaidAmount =
      validated.paidAmount !== undefined
        ? (validated.paidAmount ?? 0)
        : (existing.paidAmount ?? 0)

    if (validated.status === "PAID" && validated.paidAmount === undefined) {
      nextPaidAmount = nextAmount
    } else if (validated.status === "DUE" && validated.paidAmount === undefined) {
      nextPaidAmount = 0
    }

    const normalized = normalizePaymentState({
      amount: nextAmount,
      paidAmount: nextPaidAmount,
      status: validated.status ?? (existing.status as "DUE" | "PARTIAL" | "PAID"),
    })

    const nextPaidAt =
      normalized.paidAmount && normalized.paidAmount > 0
        ? validated.paidAt !== undefined
          ? (validated.paidAt ? new Date(validated.paidAt) : new Date())
          : (existing.paidAt ?? new Date())
        : null

    const updated = await prisma.employeePayment.update({
      where: { id },
      data: {
        periodStart: validated.periodStart ? new Date(validated.periodStart) : undefined,
        periodEnd: validated.periodEnd ? new Date(validated.periodEnd) : undefined,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        amount: validated.amount,
        unit: validated.unit,
        paidAmount: normalized.paidAmount,
        paidAt: nextPaidAt,
        status: normalized.status,
        notes:
          existing.type === "GOLD"
            ? normalizedGoldNotes
            : (validated.notes !== undefined ? validated.notes : undefined),
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
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "employee-payments",
        sourceAction: "payment-updated",
        sourceId: updated.id,
        description: `${updated.type} employee payment updated`,
        amount: updated.amount,
        payload: {
          employeeId: updated.employee.id,
          status: updated.status,
          paidAmount: updated.paidAmount,
        },
        createdById: session.user.id,
        status: "IGNORED",
      })
    } catch (error) {
      console.error("[Accounting] Employee payment update capture failed:", error)
    }

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/employee-payments/[id] error:", error)
    return errorResponse("Failed to update employee payment")
  }
}
