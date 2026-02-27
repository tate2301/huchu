import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

function normalizeExpenseTypeName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

const expenseTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).transform(normalizeExpenseTypeName),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const active = searchParams.get("active")
    const search = searchParams.get("search")?.trim()

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (active !== "all") {
      where.isActive = active === null ? true : active === "true"
    }
    if (search) {
      where.name = { contains: search, mode: "insensitive" }
    }

    const expenseTypes = await prisma.goldExpenseType.findMany({
      where,
      select: {
        id: true,
        name: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })

    return successResponse({ expenseTypes })
  } catch (error) {
    console.error("[API] GET /api/gold/expense-types error:", error)
    return errorResponse("Failed to fetch gold expense types")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to create expense types", 403)
    }

    const body = await request.json()
    const validated = expenseTypeSchema.parse(body)

    const existing = await prisma.goldExpenseType.findFirst({
      where: {
        companyId: session.user.companyId,
        name: { equals: validated.name, mode: "insensitive" },
      },
      select: { id: true },
    })

    if (existing) {
      return errorResponse("Expense type already exists", 409)
    }

    const created = await prisma.goldExpenseType.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        sortOrder: validated.sortOrder ?? 0,
        isActive: validated.isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/expense-types error:", error)
    return errorResponse("Failed to create gold expense type")
  }
}
