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
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator"

const stockLocationSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200),
  siteId: z.string().uuid(),
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
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    }

    if (siteId) where.siteId = siteId
    if (active !== null) where.isActive = active === "true"

    const [locations, total] = await Promise.all([
      prisma.stockLocation.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          siteId: true,
          isActive: true,
          site: { select: { name: true, code: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.stockLocation.count({ where }),
    ])

    return successResponse(paginationResponse(locations, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/stock-locations error:", error)
    return errorResponse("Failed to fetch stock locations")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = stockLocationSchema.parse(body)
    const code = validated.code
      ? normalizeProvidedId(validated.code, "STOCK_LOCATION")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "STOCK_LOCATION",
          siteId: validated.siteId,
        })

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true, isActive: true },
    })

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }

    if (!site.isActive) {
      return errorResponse("Site is not active", 400)
    }

    const existing = await prisma.stockLocation.findFirst({
      where: {
        siteId: validated.siteId,
        OR: [
          { name: { equals: validated.name, mode: "insensitive" } },
          { code },
        ],
      },
      select: { id: true },
    })

    if (existing) {
      return errorResponse("Stock location name or code already exists for this site", 409)
    }

    const location = await prisma.stockLocation.create({
      data: {
        code,
        name: validated.name,
        siteId: validated.siteId,
        isActive: validated.isActive ?? true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        siteId: true,
        isActive: true,
        site: { select: { name: true, code: true } },
      },
    })

    return successResponse(location, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/stock-locations error:", error)
    return errorResponse("Failed to create stock location")
  }
}
