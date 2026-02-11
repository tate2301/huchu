import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import {
  createApprovalAction,
  ensureApproverRole,
  generateDisbursementCode,
} from "@/lib/hr-payroll"

const batchSchema = z.object({
  payrollRunId: z.string().uuid(),
  code: z.string().trim().min(1).max(100).optional(),
  method: z.enum(["CASH"]).optional(),
  goldRatePerUnit: z.number().positive().optional(),
  goldRateUnit: z.string().trim().min(1).max(20).optional(),
  notes: z.string().max(1000).optional(),
  cashCustodian: z.string().max(200).optional(),
  cashIssuedAt: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
})

function parseGoldWeight(line: {
  baseAmount: number
  netAmount: number
  notes: string | null
}, fallbackRate?: number | null) {
  if (line.baseAmount > 0) return line.baseAmount

  const notes = line.notes ?? ""
  const match = notes.match(/gold payout conversion:\s*([0-9]+(?:\.[0-9]+)?)/i)
  if (match) {
    const parsed = Number(match[1])
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  if (fallbackRate && fallbackRate > 0) {
    const derived = line.netAmount / fallbackRate
    if (Number.isFinite(derived) && derived > 0) return derived
  }

  return null
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const status = searchParams.get("status")
    const payrollRunId = searchParams.get("payrollRunId")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }
    if (status) where.status = status
    if (payrollRunId) where.payrollRunId = payrollRunId

    const [records, total] = await Promise.all([
      prisma.disbursementBatch.findMany({
        where,
        include: {
          payrollRun: {
            select: {
              id: true,
              runNumber: true,
              domain: true,
              status: true,
              goldRatePerUnit: true,
              goldRateUnit: true,
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
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create disbursement batches", 403)
    }

    const body = await request.json()
    const validated = batchSchema.parse(body)

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
      return errorResponse(
        `Run already has disbursement batch ${existingBatch.code} (${existingBatch.status})`,
        409,
      )
    }

    const isGoldRun = run.domain === "GOLD_PAYOUT"
    const disbursementRate = isGoldRun ? (validated.goldRatePerUnit ?? run.goldRatePerUnit) : null
    const disbursementRateUnit = validated.goldRateUnit ?? run.goldRateUnit ?? "g"

    if (isGoldRun && (!disbursementRate || disbursementRate <= 0)) {
      return errorResponse("Provide the current gold rate to create this disbursement batch", 400)
    }

    const unresolvedEmployeeIds: string[] = []
    const disbursementItems = run.lineItems
      .map((line) => {
        if (!isGoldRun) {
          return {
            employeeId: line.employeeId,
            lineItemId: line.id,
            amount: roundMoney(line.netAmount),
            status: "DUE" as const,
          }
        }

        const goldWeight = parseGoldWeight(line, run.goldRatePerUnit)
        if (!goldWeight || !disbursementRate) {
          unresolvedEmployeeIds.push(line.employeeId)
          return null
        }

        return {
          employeeId: line.employeeId,
          lineItemId: line.id,
          amount: roundMoney(goldWeight * disbursementRate),
          status: "DUE" as const,
        }
      })
      .filter((item): item is {
      employeeId: string
      lineItemId: string
      amount: number
      status: "DUE"
    } => item !== null)

    if (isGoldRun && unresolvedEmployeeIds.length > 0) {
      return errorResponse(
        "Unable to derive gold weight for one or more payout lines. Regenerate the gold run first.",
        409,
        { unresolvedEmployeeIds },
      )
    }

    const code = validated.code ?? generateDisbursementCode()
    const totalAmount = disbursementItems.reduce((sum, item) => sum + item.amount, 0)
    const itemCount = disbursementItems.length
    if (itemCount === 0 || totalAmount <= 0) {
      return errorResponse("Selected run has no disbursable items", 400)
    }

    const rateNote =
      isGoldRun && disbursementRate
        ? `Disbursement rate applied: ${disbursementRate.toFixed(4)} / ${disbursementRateUnit}.`
        : undefined
    const normalizedNotes = [validated.notes?.trim(), rateNote]
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
              domain: true,
              goldRatePerUnit: true,
              goldRateUnit: true,
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
        note: isGoldRun && disbursementRate
          ? `Gold disbursement batch ${created.code} created from payout run ${run.runNumber} at ${disbursementRate.toFixed(4)} / ${disbursementRateUnit}.`
          : `Salary disbursement batch ${created.code} created from payroll run ${run.runNumber}.`,
      })

      return created
    })

    return successResponse(batch, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/disbursements/batches error:", error)
    return errorResponse("Failed to create disbursement batch")
  }
}
