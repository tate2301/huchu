import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { captureAccountingEvent } from "@/lib/accounting/integration"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { money, toNumberOrZero } from "@/lib/money"
import { derivePaidStatus } from "@/lib/payroll/disbursements"
import { prisma } from "@/lib/prisma"

/**
 * Correcting one payment.
 *
 * Most of what used to live here was gold: resolving which shift allocation a
 * payout belonged to by matching period windows, re-valuing grams at the price
 * on a valuation date, and writing a UUID into the notes column behind a magic
 * prefix so the link survived. Settlements hold that link in a real column, so
 * this is now what it says on the tin — amend an amount, a date, or a status.
 */

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

/** Same rule as the create route: the numbers decide the status. */
function normalizePaymentState(input: {
  amount: number
  paidAmount: number
  status?: "DUE" | "PARTIAL" | "PAID"
}) {
  const amount = Math.max(input.amount, 0)
  let paidAmount = Math.max(input.paidAmount, 0)
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.compensation", "edit")
    if (denial) return errorResponse(denial, 403)
    const { id } = await params

    const validated = updateEmployeePaymentSchema.parse(await request.json())
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400)
    }

    const existing = await prisma.employeePayment.findUnique({
      where: { id },
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        unit: true,
        employee: { select: { id: true, name: true, companyId: true } },
      },
    })
    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Employee payment not found", 404)
    }

    const periodStart = validated.periodStart
      ? new Date(validated.periodStart)
      : existing.periodStart
    const periodEnd = validated.periodEnd ? new Date(validated.periodEnd) : existing.periodEnd
    if (periodEnd < periodStart) {
      return errorResponse("The period ends before it starts", 400)
    }

    const normalized = normalizePaymentState({
      amount: validated.amount ?? toNumberOrZero(existing.amount),
      paidAmount:
        validated.paidAmount === undefined
          ? toNumberOrZero(existing.paidAmount)
          : (validated.paidAmount ?? 0),
      status: validated.status,
    })

    const updated = await prisma.employeePayment.update({
      where: { id },
      data: {
        periodStart,
        periodEnd,
        ...(validated.dueDate ? { dueDate: new Date(validated.dueDate) } : {}),
        amount: money(normalized.amount),
        ...(validated.unit ? { unit: validated.unit.trim().toUpperCase() } : {}),
        paidAmount: normalized.paidAmount > 0 ? money(normalized.paidAmount) : null,
        paidAt:
          normalized.paidAmount > 0
            ? validated.paidAt
              ? new Date(validated.paidAt)
              : new Date()
            : null,
        status: normalized.status,
        ...(validated.notes === undefined
          ? {}
          : { notes: validated.notes?.trim() || null }),
      },
      include: {
        employee: {
          select: { id: true, name: true, employeeId: true, position: true },
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
      },
    })

    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "employee-payments",
        sourceAction: "payment-updated",
        sourceType: "PAYROLL_DISBURSEMENT",
        sourceId: updated.id,
        entryDate: updated.updatedAt,
        description: `Employee payment for ${updated.employee.name} updated`,
        amount: toNumberOrZero(updated.amount),
        payload: {
          employeeId: updated.employee.id,
          currency: updated.unit,
          status: updated.status,
          paidAmount: toNumberOrZero(updated.paidAmount),
        },
        createdById: session.user.id,
        status: "PENDING",
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
