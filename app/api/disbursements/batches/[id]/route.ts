import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { ensureApproverRole } from "@/lib/hr-payroll"

const patchSchema = z
  .object({
    method: z.enum(["CASH"]).optional(),
    notes: z.string().max(1000).optional(),
    cashCustodian: z.string().max(200).optional(),
    cashIssuedAt: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .nullable()
      .optional(),
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          amount: z.number().min(0).optional(),
          notes: z.string().max(1000).optional(),
        }),
      )
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields provided" })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const batch = await prisma.disbursementBatch.findUnique({
      where: { id },
      include: {
        payrollRun: {
          include: {
            period: {
              select: {
                id: true,
                periodKey: true,
                startDate: true,
                endDate: true,
                dueDate: true,
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: {
            employee: { select: { id: true, employeeId: true, name: true } },
            lineItem: {
              select: {
                id: true,
                baseAmount: true,
                variableAmount: true,
                allowancesTotal: true,
                deductionsTotal: true,
                netAmount: true,
                currency: true,
              },
            },
          },
          orderBy: { employee: { name: "asc" } },
        },
      },
    })
    if (!batch || batch.companyId !== session.user.companyId) {
      return errorResponse("Disbursement batch not found", 404)
    }

    return successResponse(batch)
  } catch (error) {
    console.error("[API] GET /api/disbursements/batches/[id] error:", error)
    return errorResponse("Failed to fetch disbursement batch")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params
    const body = await request.json()
    const validated = patchSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to edit disbursement batches", 403)
    }

    const existing = await prisma.disbursementBatch.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disbursement batch not found", 404)
    }
    if (existing.status !== "DRAFT") {
      return errorResponse("Only draft batches can be edited", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (validated.items && validated.items.length > 0) {
        for (const item of validated.items) {
          await tx.disbursementItem.updateMany({
            where: { id: item.id, batchId: id },
            data: {
              amount: item.amount,
              notes: item.notes,
            },
          })
        }
      }

      const totals = await tx.disbursementItem.aggregate({
        where: { batchId: id },
        _sum: { amount: true },
        _count: { id: true },
      })

      return tx.disbursementBatch.update({
        where: { id },
        data: {
          method: validated.method,
          notes: validated.notes,
          cashCustodian: validated.cashCustodian,
          cashIssuedAt:
            validated.cashIssuedAt !== undefined
              ? validated.cashIssuedAt
                ? new Date(validated.cashIssuedAt)
                : null
              : undefined,
          totalAmount: totals._sum.amount ?? 0,
          itemCount: totals._count.id,
        },
        include: {
          payrollRun: {
            select: {
              id: true,
              runNumber: true,
              domain: true,
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
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/disbursements/batches/[id] error:", error)
    return errorResponse("Failed to update disbursement batch")
  }
}
