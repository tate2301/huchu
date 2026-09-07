import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "../../../hr/permissions"
import { captureAccountingEvent } from "@corelithzw/module-books/integration"
import { prisma } from "@corelithzw/db/client"
import { generateDisbursementCode } from "../../../payroll/disbursements"
import { createApprovalAction, ensureApproverRole } from "@corelithzw/module-workflow/approvals"
import { isZeroOrLess, money, sumMoney } from "@corelithzw/platform/money"
import { createRouteLogger } from "@corelithzw/platform/observability/route-logger"

const batchSchema = z.object({
  payrollRunId: z.string().uuid(),
  code: z.string().trim().min(1).max(100).optional(),
  method: z.enum(["CASH"]).optional(),
  notes: z.string().max(1000).optional(),
  cashCustodian: z.string().max(200).optional(),
  cashIssuedAt: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.disbursements", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const status = searchParams.get("status")
    const payrollRunId = searchParams.get("payrollRunId")
    const search = searchParams.get("search")?.trim()

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }
    if (status) where.status = status
    if (payrollRunId) where.payrollRunId = payrollRunId
    if (search) {
      const normalizedSearch = search.toUpperCase()
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { cashCustodian: { contains: search, mode: "insensitive" } },
        { payrollRun: { period: { periodKey: { contains: search, mode: "insensitive" } } } },
        ...((
          ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"] as const
        ).includes(
          normalizedSearch as "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED",
        )
          ? [{ status: normalizedSearch }]
          : []),
      ]
    }

    const [records, total] = await Promise.all([
      prisma.disbursementBatch.findMany({
        where,
        include: {
          payrollRun: {
            select: {
              id: true,
              runNumber: true,
              status: true,
              period: { select: { id: true, periodKey: true, startDate: true, endDate: true } },
            },
          },
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.disbursementBatch.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/disbursements/batches error:", error)
    return errorResponse("Failed to fetch disbursement batches")
  }
}

export async function POST(request: NextRequest) {
  const logger = createRouteLogger({
    route: "/api/disbursements/batches",
    request,
  })
  logger.info("start")

  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.disbursements", "create")
    if (denial) return errorResponse(denial, 403)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create disbursement batches", 403)
    }

    const body = await request.json()
    const validated = batchSchema.parse(body)
    logger.info("create_disbursement_batch_requested", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: validated.payrollRunId,
      method: validated.method ?? "CASH",
    })

    const run = await prisma.payrollRun.findUnique({
      where: { id: validated.payrollRunId },
      include: {
        company: { select: { cashDisbursementOnly: true } },
        period: { select: { startDate: true, endDate: true, periodKey: true } },
        lineItems: {
          where: { netAmount: { gt: 0 } },
          select: {
            id: true,
            employeeId: true,
            baseAmount: true,
            netAmount: true,
            currency: true,
            exchangeRate: true,
            netBaseAmount: true,
            notes: true,
          },
        },
      },
    })
    if (!run || run.companyId !== session.user.companyId) {
      return errorResponse("Payroll run not found", 404)
    }
    if (run.status !== "APPROVED") {
      return errorResponse("Only approved payroll runs can create disbursement batches", 400)
    }
    if (run.company.cashDisbursementOnly && validated.method && validated.method !== "CASH") {
      return errorResponse("Only cash disbursements are enabled", 400)
    }

    const existingBatch = await prisma.disbursementBatch.findFirst({
      where: {
        companyId: session.user.companyId,
        payrollRunId: run.id,
        status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PAID"] },
      },
      select: { id: true, code: true, status: true },
    })
    if (existingBatch) {
      logger.info("create_disbursement_batch_conflict", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: run.id,
        disbursementBatchId: existingBatch.id,
        existingStatus: existingBatch.status,
        statusCode: 409,
      })
      return errorResponse(
        `Run already has disbursement batch ${existingBatch.code} (${existingBatch.status})`,
        409,
      )
    }

    // Currency, rate and base amount are copied off the line rather than
    // re-derived. The line froze its rate when the run was computed; looking the
    // rate up again here would pay a ZWG employee at today's rate against a
    // figure struck at last month's, and the ledger would not balance.
    const disbursementItems = run.lineItems.map((line) => ({
      employeeId: line.employeeId,
      lineItemId: line.id,
      amount: money(line.netAmount),
      currency: line.currency,
      exchangeRate: line.exchangeRate,
      baseAmount: money(line.netBaseAmount),
      status: "DUE" as const,
    }))

    const code = validated.code ?? generateDisbursementCode()
    const totalAmount = sumMoney(disbursementItems.map((item) => item.amount))
    const itemCount = disbursementItems.length
    // A batch is one currency. Mixed-currency runs need one batch per currency,
    // which the caller drives by filtering the run — a single batch total that
    // added USD to ZWG would be a number with no meaning.
    const batchCurrency = disbursementItems[0]?.currency ?? "USD"
    if (disbursementItems.some((item) => item.currency !== batchCurrency)) {
      return errorResponse(
        "This run pays in more than one currency. Create one batch per currency.",
        400,
      )
    }
    if (itemCount === 0 || isZeroOrLess(totalAmount)) {
      logger.info("create_disbursement_batch_empty", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: run.id,
        itemCount,
        totalAmount,
        statusCode: 400,
      })
      return errorResponse("Selected run has no disbursable items", 400)
    }

    const normalizedNotes = [validated.notes?.trim()]
      .filter((value): value is string => Boolean(value))
      .join(" | ")
      .slice(0, 1000)

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.disbursementBatch.create({
        data: {
          companyId: session.user.companyId,
          payrollRunId: run.id,
          code,
          status: "DRAFT",
          method: "CASH",
          notes: normalizedNotes,
          cashCustodian: validated.cashCustodian,
          cashIssuedAt: validated.cashIssuedAt ? new Date(validated.cashIssuedAt) : undefined,
          totalAmount,
          currency: batchCurrency,
          itemCount,
          createdById: session.user.id,
          items: {
            create: disbursementItems,
          },
        },
        include: {
          payrollRun: {
            select: {
              id: true,
              runNumber: true,
              period: { select: { id: true, periodKey: true, startDate: true, endDate: true } },
            },
          },
          items: {
            include: {
              employee: { select: { id: true, employeeId: true, name: true } },
            },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "DISBURSEMENT_BATCH",
        entityId: created.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
        note: `Salary disbursement batch ${created.code} created from payroll run ${run.runNumber}.`,
      })

      return created
    })

    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "disbursements",
        sourceAction: "batch-created",
        sourceType: "PAYROLL_DISBURSEMENT",
        sourceId: batch.id,
        entryDate: batch.createdAt,
        description: `Disbursement batch ${batch.code} created`,
        amount: batch.totalAmount,
        payload: {
          payrollRunId: batch.payrollRun.id,
          itemCount: batch.items.length,
        },
        createdById: session.user.id,
        status: "PENDING",
      })
    } catch (error) {
      logger.error("disbursement_batch_capture_failed", error, {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: batch.payrollRun.id,
        disbursementBatchId: batch.id,
      })
    }

    logger.info("create_disbursement_batch_success", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: batch.payrollRun.id,
      disbursementBatchId: batch.id,
      itemCount: batch.items.length,
      totalAmount: batch.totalAmount,
      statusCode: 201,
    })
    return successResponse(batch, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    logger.error("create_disbursement_batch_failed", error)
    return errorResponse("Failed to create disbursement batch")
  }
}
