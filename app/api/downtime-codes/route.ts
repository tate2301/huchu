import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { hasRole, validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const downtimeCodeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(300),
  siteId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const active = searchParams.get("active")
    const search = searchParams.get("search")?.trim()

    const isActive = active === null ? true : active === "true"

    if (siteId) {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { companyId: true },
      })

      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
    }

    const where: Record<string, unknown> = {
      OR: siteId
        ? [{ siteId }, { siteId: null }]
        : [{ siteId: null }, { site: { companyId: session.user.companyId } }],
    }
    if (active !== "all") {
      where.isActive = isActive
    }
    if (search) {
      where.AND = [
        {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        },
      ]
    }

    const codes = await prisma.downtimeCode.findMany({
      where,
      select: {
        id: true,
        code: true,
        description: true,
        siteId: true,
        sortOrder: true,
        isActive: true,
        site: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })

    return successResponse({ codes })
  } catch (error) {
    console.error("[API] GET /api/downtime-codes error:", error)
    return errorResponse("Failed to fetch downtime codes")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to create downtime codes", 403)
    }

    const body = await request.json()
    const validated = downtimeCodeSchema.parse(body)

    if (!validated.siteId) {
      return errorResponse("Site is required for tenant downtime codes", 400)
    }

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true },
    })
    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }

    const created = await prisma.downtimeCode.create({
      data: {
        code: validated.code.toUpperCase(),
        description: validated.description,
        siteId: validated.siteId,
        sortOrder: validated.sortOrder ?? 0,
        isActive: validated.isActive ?? true,
      },
      select: {
        id: true,
        code: true,
        description: true,
        siteId: true,
        sortOrder: true,
        isActive: true,
        site: { select: { id: true, name: true, code: true } },
      },
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/downtime-codes error:", error)
    return errorResponse("Failed to create downtime code")
  }
}
