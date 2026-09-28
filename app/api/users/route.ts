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
import { ROLES } from "@/lib/roles"
import { findLastSignInByEmail } from "@/lib/auth-core/last-sign-in"

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
        .filter((value) => (ROLES as readonly string[]).includes(value))
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

    // One grouped read for the whole page, not one per row. `User` records no
    // sign-in time; the audit ledger does, keyed by the normalised email, and
    // a `findFirst` per user would be 25 round trips every time somebody typed
    // in the search box.
    const lastSignInByEmail = await findLastSignInByEmail({
      companyId: session.user.companyId,
      emails: users.map((user) => user.email),
    })

    const rows = users.map((user) => ({
      ...user,
      // Null means this account has never signed in — the register draws that
      // rather than leaving the column blank.
      lastSignInAt:
        lastSignInByEmail.get(user.email.trim().toLowerCase())?.toISOString() ?? null,
    }))

    return successResponse(paginationResponse(rows, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/users error:", error)
    return errorResponse("Failed to fetch users")
  }
}
