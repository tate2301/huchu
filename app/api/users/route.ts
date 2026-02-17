import { NextRequest, NextResponse } from "next/server"
import {
  hasRole,
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const USER_ROLES = ["SUPERADMIN", "MANAGER", "CLERK"] as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to view users", 403)
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role")
    const active = searchParams.get("active")
    const search = searchParams.get("search")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (role) {
      const normalizedRoles = role
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value): value is (typeof USER_ROLES)[number] =>
          (USER_ROLES as readonly string[]).includes(value),
        )
      if (normalizedRoles.length === 1) {
        where.role = normalizedRoles[0]
      } else if (normalizedRoles.length > 1) {
        where.role = { in: normalizedRoles }
      }
    }
    if (active !== null) where.isActive = active === "true"
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return successResponse(paginationResponse(users, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/users error:", error)
    return errorResponse("Failed to fetch users")
  }
}
