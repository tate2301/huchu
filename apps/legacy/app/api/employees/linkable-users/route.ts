import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
} from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"
import { prisma } from "@corelithzw/db/client"
import { Prisma } from "@corelithzw/db"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.employees", "view")
    if (denial) return errorResponse(denial, 403)
    if (session.user.role !== "SUPERADMIN") {
      return errorResponse("Only superadmins can link user accounts to employees", 403)
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim()

    const where: Prisma.UserWhereInput = {
      companyId: session.user.companyId,
      employeeProfile: { is: null },
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    })

    return successResponse({ data: users })
  } catch (error) {
    console.error("[API] GET /api/employees/linkable-users error:", error)
    return errorResponse("Failed to fetch linkable users")
  }
}
