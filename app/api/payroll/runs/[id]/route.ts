import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { ensureApproverRole } from "@/lib/hr-payroll"

const lineItemPatchSchema = z.object({
  id: z.string().uuid(),
  baseAmount: z.number().min(0).optional(),
  variableAmount: z.number().min(0).optional(),
  allowancesTotal: z.number().min(0).optional(),
  deductionsTotal: z.number().min(0).optional(),
  grossAmount: z.number().min(0).optional(),
  netAmount: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
})

const runPatchSchema = z
  .object({
    notes: z.string().max(1000).optional(),
    lineItems: z.array(lineItemPatchSchema).optional(),
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

    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        period: {
          select: {
            id: true,
            periodKey: true,
            startDate: true,
            endDate: true,
            dueDate: true,
            status: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        lineItems: {
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                name: true,
                department: { select: { code: true, name: true } },
                grade: { select: { code: true, name: true } },
              },
            },
            compensationProfile: {
              select: {
                id: true,
                baseAmount: true,
                currency: true,
                effectiveFrom: true,
                effectiveTo: true,
              },
            },
            components: true,
          },
          orderBy: { employee: { name: "asc" } },
        },
      },
    })

    if (!run || run.companyId !== session.user.companyId) {
      return errorResponse("Payroll run not found", 404)
    }

    return successResponse(run)
  } catch (error) {
    console.error("[API] GET /api/payroll/runs/[id] error:", error)
    return errorResponse("Failed to fetch payroll run")
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
    const validated = runPatchSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to edit payroll runs", 403)
    }

    const existing = await prisma.payrollRun.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Payroll run not found", 404)
    }
    if (existing.status !== "DRAFT") {
      return errorResponse("Only draft payroll runs can be edited", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (validated.lineItems && validated.lineItems.length > 0) {
        for (const line of validated.lineItems) {
          await tx.payrollLineItem.updateMany({
            where: { id: line.id, runId: id },
            data: {
              baseAmount: line.baseAmount,
              variableAmount: line.variableAmount,
              allowancesTotal: line.allowancesTotal,
              deductionsTotal: line.deductionsTotal,
              grossAmount: line.grossAmount,
              netAmount: line.netAmount,
              notes: line.notes,
            },
          })
        }
      }

      const lineTotals = await tx.payrollLineItem.aggregate({
        where: { runId: id },
        _sum: {
          grossAmount: true,
          allowancesTotal: true,
          deductionsTotal: true,
          netAmount: true,
        },
      })

      return tx.payrollRun.update({
        where: { id },
        data: {
          notes: validated.notes,
          grossTotal: lineTotals._sum.grossAmount ?? 0,
          allowancesTotal: lineTotals._sum.allowancesTotal ?? 0,
          deductionsTotal: lineTotals._sum.deductionsTotal ?? 0,
          netTotal: lineTotals._sum.netAmount ?? 0,
        },
        include: {
          period: {
            select: {
              id: true,
              periodKey: true,
              startDate: true,
              endDate: true,
              dueDate: true,
              status: true,
            },
          },
          lineItems: {
            include: {
              employee: { select: { id: true, employeeId: true, name: true } },
              components: true,
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
    console.error("[API] PATCH /api/payroll/runs/[id] error:", error)
    return errorResponse("Failed to update payroll run")
  }
}
