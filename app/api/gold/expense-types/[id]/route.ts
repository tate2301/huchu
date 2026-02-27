import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

function normalizeExpenseTypeName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

const updateExpenseTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).transform(normalizeExpenseTypeName).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields provided" })

const expenseTypeSelect = {
  id: true,
  companyId: true,
  name: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const expenseType = await prisma.goldExpenseType.findUnique({
      where: { id },
      select: expenseTypeSelect,
    })

    if (!expenseType || expenseType.companyId !== session.user.companyId) {
      return errorResponse("Expense type not found", 404)
    }

    return successResponse(expenseType)
  } catch (error) {
    console.error("[API] GET /api/gold/expense-types/[id] error:", error)
    return errorResponse("Failed to fetch gold expense type")
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

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to update expense types", 403)
    }

    const body = await request.json()
    const validated = updateExpenseTypeSchema.parse(body)

    const existing = await prisma.goldExpenseType.findUnique({
      where: { id },
      select: expenseTypeSelect,
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Expense type not found", 404)
    }

    if (validated.name) {
      const duplicate = await prisma.goldExpenseType.findFirst({
        where: {
          companyId: session.user.companyId,
          id: { not: id },
          name: { equals: validated.name, mode: "insensitive" },
        },
        select: { id: true },
      })

      if (duplicate) {
        return errorResponse("Expense type already exists", 409)
      }
    }

    const updated = await prisma.goldExpenseType.update({
      where: { id },
      data: {
        name: validated.name,
        sortOrder: validated.sortOrder,
        isActive: validated.isActive,
      },
      select: expenseTypeSelect,
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/gold/expense-types/[id] error:", error)
    return errorResponse("Failed to update gold expense type")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to archive expense types", 403)
    }

    const existing = await prisma.goldExpenseType.findUnique({
      where: { id },
      select: expenseTypeSelect,
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Expense type not found", 404)
    }

    if (!existing.isActive) {
      return successResponse({ success: true, archived: true })
    }

    await prisma.goldExpenseType.update({
      where: { id },
      data: { isActive: false },
    })

    return successResponse({ success: true, archived: true })
  } catch (error) {
    console.error("[API] DELETE /api/gold/expense-types/[id] error:", error)
    return errorResponse("Failed to archive gold expense type")
  }
}
