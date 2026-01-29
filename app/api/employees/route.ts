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

const employeeSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  nextOfKinName: z.string().min(1).max(200),
  nextOfKinPhone: z.string().min(1).max(30),
  passportPhotoUrl: z.string().min(1).max(2048),
  villageOfOrigin: z.string().min(1).max(200),
  position: z.enum([
    "MANAGER",
    "CLERK",
    "SUPPORT_STAFF",
    "ENGINEERS",
    "CHEMIST",
    "MINERS",
  ]),
  isActive: z.boolean().optional(),
})

const EMPLOYEE_ID_PREFIX = "EMP-"
const EMPLOYEE_ID_PAD = 4

async function generateEmployeeId(companyId: string) {
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { employeeId: true },
  })

  let max = 0
  const existingIds = new Set<string>()

  for (const employee of employees) {
    existingIds.add(employee.employeeId)
    const match = employee.employeeId.match(/^EMP-(\d+)$/i)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value)) {
      max = Math.max(max, value)
    }
  }

  let next = max + 1
  let candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`
  while (existingIds.has(candidate)) {
    next += 1
    candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`
  }

  return candidate
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const active = searchParams.get("active")
    const search = searchParams.get("search")
    const position = searchParams.get("position")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (active !== null) where.isActive = active === "true"
    if (position) where.position = position
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          name: true,
          phone: true,
          nextOfKinName: true,
          nextOfKinPhone: true,
          passportPhotoUrl: true,
          villageOfOrigin: true,
          position: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.employee.count({ where }),
    ])

    return successResponse(paginationResponse(employees, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/employees error:", error)
    return errorResponse("Failed to fetch employees")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = employeeSchema.parse(body)

    const employeeId = await generateEmployeeId(session.user.companyId)
    const employee = await prisma.employee.create({
      data: {
        employeeId,
        name: validated.name,
        phone: validated.phone,
        nextOfKinName: validated.nextOfKinName,
        nextOfKinPhone: validated.nextOfKinPhone,
        passportPhotoUrl: validated.passportPhotoUrl,
        villageOfOrigin: validated.villageOfOrigin,
        position: validated.position,
        isActive: validated.isActive ?? true,
        companyId: session.user.companyId,
      },
    })

    return successResponse(employee, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/employees error:", error)
    return errorResponse("Failed to create employee")
  }
}
