import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  amount: z.number().min(0).optional(),
  unit: z.string().min(1).max(20).optional(),
  paidAmount: z.number().min(0).optional(),
  paidAt: z.string().datetime().optional(),
  status: z.enum(["DUE", "PARTIAL", "PAID"]).optional(),
  notes: z.string().max(1000).optional(),
})

function deriveStatus(amount: number, paidAmount?: number) {
  if (!paidAmount || paidAmount <= 0) return "DUE"
  if (paidAmount >= amount) return "PAID"
  return "PARTIAL"
}

type RouteParams = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = updateSchema.parse(body)

    const existing = await prisma.employeePayment.findUnique({
      where: { id: params.id },
      include: { employee: { select: { companyId: true } } },
    })

    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Payment record not found", 404)
    }

    const nextAmount = validated.amount ?? existing.amount
    const nextPaidAmount = validated.paidAmount ?? existing.paidAmount ?? 0
    const status = validated.status ?? deriveStatus(nextAmount, nextPaidAmount)

    const updated = await prisma.employeePayment.update({
      where: { id: params.id },
      data: {
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        amount: validated.amount,
        unit: validated.unit,
        paidAmount: validated.paidAmount,
        paidAt: validated.paidAt ? new Date(validated.paidAt) : undefined,
        status,
        notes: validated.notes,
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
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/employee-payments/[id] error:", error)
    return errorResponse("Failed to update payment record")
  }
}
