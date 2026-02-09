import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  monthlyAmount: z.number().min(0).optional(),
  currency: z.string().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
})

type RouteParams = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = updateSchema.parse(body)

    if (
      validated.monthlyAmount === undefined &&
      validated.currency === undefined &&
      validated.isActive === undefined
    ) {
      return errorResponse("No fields provided", 400)
    }

    const existing = await prisma.fixedSalary.findUnique({
      where: { id: params.id },
      include: { employee: { select: { companyId: true } } },
    })

    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Fixed salary not found", 404)
    }

    const updated = await prisma.fixedSalary.update({
      where: { id: params.id },
      data: {
        monthlyAmount: validated.monthlyAmount,
        currency: validated.currency,
        isActive: validated.isActive,
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
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/fixed-salaries/[id] error:", error)
    return errorResponse("Failed to update fixed salary")
  }
}
