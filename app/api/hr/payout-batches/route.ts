import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const dateInputSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const payoutBatchSchema = z.object({
  source: z.enum(["COMMISSION", "OTHER"]),
  label: z.string().trim().min(1).max(200),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
  dueDate: dateInputSchema,
  currency: z.string().trim().min(1).max(10).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        amount: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(500),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const source = searchParams.get("source")
    const workflowStatus = searchParams.get("workflowStatus")
    const search = searchParams.get("search")?.trim()

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }
    if (source === "COMMISSION" || source === "OTHER") where.source = source
    if (
      workflowStatus === "DRAFT" ||
      workflowStatus === "SUBMITTED" ||
      workflowStatus === "APPROVED" ||
      workflowStatus === "REJECTED"
    ) {
      where.workflowStatus = workflowStatus
    }
    if (search) {
      where.OR = [
        { label: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { items: { some: { employee: { name: { contains: search, mode: "insensitive" } } } } },
        { items: { some: { employee: { employeeId: { contains: search, mode: "insensitive" } } } } },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.irregularPayoutBatch.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          items: {
            include: {
              employee: { select: { id: true, employeeId: true, name: true } },
            },
            orderBy: { employee: { name: "asc" } },
          },
        },
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.irregularPayoutBatch.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/hr/payout-batches error:", error)
    return errorResponse("Failed to fetch irregular payout batches")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create irregular payout batches", 403)
    }

    const body = await request.json()
    const validated = payoutBatchSchema.parse(body)

    const uniqueEmployeeIds = Array.from(new Set(validated.items.map((item) => item.employeeId)))
    if (uniqueEmployeeIds.length !== validated.items.length) {
      return errorResponse("Each employee can only appear once per payout batch", 400)
    }

    const employees = await prisma.employee.findMany({
      where: {
        companyId: session.user.companyId,
        id: { in: uniqueEmployeeIds },
      },
      select: { id: true, isActive: true, defaultCurrency: true },
    })
    if (employees.length !== uniqueEmployeeIds.length) {
      return errorResponse("One or more employees are invalid for this company", 403)
    }

    const currency = validated.currency?.trim() || "USD"

    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.irregularPayoutBatch.create({
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
              amount: item.amount,
              notes: item.notes?.trim() || undefined,
            })),
          },
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              employee: { select: { id: true, employeeId: true, name: true } },
            },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await tx.employeePayment.createMany({
        data: validated.items.map((item) => ({
          employeeId: item.employeeId,
          type: "IRREGULAR",
          payoutSource: validated.source,
          periodStart: new Date(validated.periodStart),
          periodEnd: new Date(validated.periodEnd),
          dueDate: new Date(validated.dueDate),
          amount: item.amount,
          amountUsd: item.amount,
          unit: currency,
          status: "DUE",
          notes: item.notes?.trim() || batch.label,
          irregularPayoutBatchId: batch.id,
          createdById: session.user.id,
        })),
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "IRREGULAR_PAYOUT_BATCH",
        entityId: batch.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
        note: `${validated.source} payout batch ${batch.label} created.`,
      })

      return batch
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/payout-batches error:", error)
    return errorResponse("Failed to create irregular payout batch")
  }
}
