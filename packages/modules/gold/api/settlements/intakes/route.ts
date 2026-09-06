import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { money, rate, sumMoney } from "@corelithzw/platform/money"
import { prisma } from "@corelithzw/db/client"
import { settlementPermissionDenial } from "../../../settlements/permissions"
import { getSettlementSourceMeta, parseSettlementSource } from "../../../settlements/sources"
import { createApprovalAction } from "@corelithzw/module-workflow/approvals"

/**
 * What is owed, before anyone decides to pay it.
 *
 * `GOLD` is absent from the source enum here on purpose. Gold's quantities come
 * from `GoldShiftAllocation`, which the gold module already approves through its
 * own workflow — letting an operator type a second set of gram figures would give
 * two answers to what one worker has coming, and nothing would say which is right.
 */

const dateInput = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const intakeSchema = z.object({
  source: z.enum(["SCRAP", "COMMISSION", "OTHER"]),
  label: z.string().trim().min(1).max(200),
  periodStart: dateInput,
  periodEnd: dateInput,
  dueDate: dateInput,
  currency: z.string().trim().min(1).max(10).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        // Quantity is optional: a commission is money with nothing to weigh.
        quantity: z.number().nonnegative().optional(),
        unit: z.string().trim().min(1).max(16).optional(),
        amount: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(500),
})

const ITEM_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  items: {
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { employee: { name: "asc" } },
  },
} as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.intake", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const source = parseSettlementSource(searchParams.get("source"))
    const workflowStatus = searchParams.get("workflowStatus")
    const search = searchParams.get("search")?.trim()

    const where: Record<string, unknown> = { companyId: session.user.companyId }
    if (source) where.source = source
    if (["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].includes(workflowStatus ?? "")) {
      where.workflowStatus = workflowStatus
    }
    if (search) {
      where.OR = [
        { label: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { items: { some: { employee: { name: { contains: search, mode: "insensitive" } } } } },
        {
          items: {
            some: { employee: { employeeId: { contains: search, mode: "insensitive" } } },
          },
        },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.settlementIntake.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.settlementIntake.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/settlements/intakes error:", error)
    return errorResponse("Failed to fetch settlement intakes")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.intake", "create")
    if (denial) return errorResponse(denial, 403)

    const validated = intakeSchema.parse(await request.json())

    const employeeIds = [...new Set(validated.items.map((item) => item.employeeId))]
    if (employeeIds.length !== validated.items.length) {
      return errorResponse("Each employee can only appear once per intake", 400)
    }

    const employees = await prisma.employee.findMany({
      where: { companyId: session.user.companyId, id: { in: employeeIds } },
      select: { id: true },
    })
    if (employees.length !== employeeIds.length) {
      return errorResponse("One or more employees are invalid for this company", 403)
    }

    const defaultUnit = getSettlementSourceMeta(validated.source).defaultUnit
    const currency = validated.currency?.trim().toUpperCase() || "USD"

    const created = await prisma.$transaction(async (tx) => {
      const intake = await tx.settlementIntake.create({
        data: {
          companyId: session.user.companyId,
          source: validated.source,
          label: validated.label.trim(),
          periodStart: new Date(validated.periodStart),
          periodEnd: new Date(validated.periodEnd),
          dueDate: new Date(validated.dueDate),
          currency,
          notes: validated.notes?.trim() || undefined,
          createdById: session.user.id,
          items: {
            create: validated.items.map((item) => ({
              employeeId: item.employeeId,
              quantity: rate(item.quantity ?? 0),
              unit: item.unit?.trim() || defaultUnit,
              amount: money(item.amount),
              notes: item.notes?.trim() || undefined,
            })),
          },
        },
        include: ITEM_INCLUDE,
      })

      // No `SettlementPayment` rows here. An intake is a claim, not a payment —
      // the model this replaces wrote an `EmployeePayment` per item at creation
      // time, so an unapproved batch already showed as money owed.
      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "SETTLEMENT_INTAKE",
        entityId: intake.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
        note: `${validated.source} intake ${intake.label} created.`,
      })

      return intake
    })

    return successResponse(
      { ...created, totalAmount: sumMoney(created.items.map((item) => item.amount)) },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/settlements/intakes error:", error)
    return errorResponse("Failed to create settlement intake")
  }
}
