import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const fixedSalarySchema = z.object({
  employeeId: z.string().uuid(),
  monthlyAmount: z.number().min(0),
  currency: z.string().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const active = searchParams.get("active")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      employee: { companyId: session.user.companyId },
    }

    if (active !== null) {
      where.isActive = active === "true"
    }

    const [records, total] = await Promise.all([
      prisma.fixedSalary.findMany({
        where,
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
        orderBy: { employee: { name: "asc" } },
        skip,
        take: limit,
      }),
      prisma.fixedSalary.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/fixed-salaries error:", error)
    return errorResponse("Failed to fetch fixed salaries")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = fixedSalarySchema.parse(body)

    const employee = await prisma.employee.findUnique({
      where: { id: validated.employeeId },
      select: { companyId: true, isActive: true },
    })

    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }

    const record = await prisma.fixedSalary.upsert({
      where: { employeeId: validated.employeeId },
      update: {
        monthlyAmount: validated.monthlyAmount,
        currency: validated.currency ?? "USD",
        isActive: validated.isActive ?? true,
      },
      create: {
        employeeId: validated.employeeId,
        monthlyAmount: validated.monthlyAmount,
        currency: validated.currency ?? "USD",
        isActive: validated.isActive ?? true,
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

    return successResponse(record, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/fixed-salaries error:", error)
    return errorResponse("Failed to save fixed salary")
  }
}
