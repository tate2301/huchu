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

const paymentSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(["GOLD", "SALARY"]),
  periodStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  periodEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.number().min(0),
  unit: z.string().min(1).max(20),
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

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const employeeId = searchParams.get("employeeId")
    const status = searchParams.get("status")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      employee: { companyId: session.user.companyId },
    }

    if (type) where.type = type
    if (employeeId) where.employeeId = employeeId
    if (status) where.status = status
    if (startDate) where.periodStart = { ...where.periodStart, gte: new Date(startDate) }
    if (endDate) where.periodEnd = { ...where.periodEnd, lte: new Date(endDate) }

    const [payments, total] = await Promise.all([
      prisma.employeePayment.findMany({
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
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { periodEnd: "desc" },
        skip,
        take: limit,
      }),
      prisma.employeePayment.count({ where }),
    ])

    return successResponse(paginationResponse(payments, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/employee-payments error:", error)
    return errorResponse("Failed to fetch employee payments")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = paymentSchema.parse(body)

    const employee = await prisma.employee.findUnique({
      where: { id: validated.employeeId },
      select: { companyId: true },
    })

    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }

    const status = validated.status ?? deriveStatus(validated.amount, validated.paidAmount)
    const payment = await prisma.employeePayment.create({
      data: {
        employeeId: validated.employeeId,
        type: validated.type,
        periodStart: new Date(validated.periodStart),
        periodEnd: new Date(validated.periodEnd),
        dueDate: new Date(validated.dueDate),
        amount: validated.amount,
        unit: validated.unit,
        paidAmount: validated.paidAmount,
        paidAt: validated.paidAt ? new Date(validated.paidAt) : undefined,
        status,
        notes: validated.notes,
        createdById: session.user.id,
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

    return successResponse(payment, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/employee-payments error:", error)
    return errorResponse("Failed to create payment record")
  }
}
