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

const goldDispatchSchema = z.object({
  goldPourId: z.string().uuid(),
  dispatchDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  courier: z.string().min(1).max(200),
  vehicle: z.string().max(100).optional(),
  destination: z.string().min(1).max(200),
  sealNumbers: z.string().min(1).max(200),
  handedOverById: z.string().uuid(),
  receivedBy: z.string().max(200).optional(),
  overrideReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const goldPourId = searchParams.get("goldPourId")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      goldPour: { site: { companyId: session.user.companyId } },
    }

    if (siteId) {
      const goldPourWhere = (where.goldPour as Record<string, unknown> | undefined) ?? {}
      where.goldPour = { ...goldPourWhere, siteId }
    }
    if (goldPourId) where.goldPourId = goldPourId

    const [dispatches, total] = await Promise.all([
      prisma.goldDispatch.findMany({
        where,
        include: {
          goldPour: {
            select: {
              id: true,
              pourBarId: true,
              pourDate: true,
              grossWeight: true,
              site: { select: { name: true, code: true } },
            },
          },
          handedOverBy: { select: { name: true } },
        },
        orderBy: { dispatchDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.goldDispatch.count({ where }),
    ])

    const normalizedDispatches = dispatches.map((dispatch) => ({
      ...dispatch,
      batchId: dispatch.goldPour.id,
      batchCode: dispatch.goldPour.pourBarId,
      goldPour: {
        ...dispatch.goldPour,
        batchId: dispatch.goldPour.id,
        batchCode: dispatch.goldPour.pourBarId,
      },
    }))

    return successResponse(
      paginationResponse(normalizedDispatches, total, page, limit),
    )
  } catch (error) {
    console.error("[API] GET /api/gold/dispatches error:", error)
    return errorResponse("Failed to fetch gold dispatches")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = goldDispatchSchema.parse(body)

    const goldPour = await prisma.goldPour.findUnique({
      where: { id: validated.goldPourId },
      include: { site: { select: { companyId: true, isActive: true } } },
    })

    if (!goldPour || goldPour.site.companyId !== session.user.companyId) {
      return errorResponse("Invalid gold pour", 403)
    }

    if (!goldPour.site.isActive) {
      return errorResponse("Site is not active", 400)
    }

    const existingDispatchCount = await prisma.goldDispatch.count({
      where: { goldPourId: validated.goldPourId },
    })

    const requiresOverride = existingDispatchCount > 0
    if (requiresOverride && !validated.overrideReason?.trim()) {
      return errorResponse(
        "This batch already has a dispatch. Add an override reason to continue.",
        409,
        {
          requiresOverride: true,
          existingDispatchCount,
        },
      )
    }

    const handedOverBy = await prisma.employee.findUnique({
      where: { id: validated.handedOverById },
      select: { companyId: true, isActive: true },
    })

    if (!handedOverBy || handedOverBy.companyId !== session.user.companyId || !handedOverBy.isActive) {
      return errorResponse("Invalid handover user", 400)
    }

    const notesSegments = [validated.notes?.trim()]
    if (validated.overrideReason?.trim()) {
      notesSegments.push(`Override reason: ${validated.overrideReason.trim()}`)
    }
    const mergedNotes = notesSegments.filter(Boolean).join("\n\n")

    const dispatchRecord = await prisma.goldDispatch.create({
      data: {
        goldPourId: validated.goldPourId,
        dispatchDate: new Date(validated.dispatchDate),
        courier: validated.courier,
        vehicle: validated.vehicle,
        destination: validated.destination,
        sealNumbers: validated.sealNumbers,
        handedOverById: validated.handedOverById,
        receivedBy: validated.receivedBy,
        notes: mergedNotes || undefined,
      },
      include: {
        goldPour: {
          select: {
            id: true,
            pourBarId: true,
            pourDate: true,
            grossWeight: true,
            site: { select: { name: true, code: true } },
          },
        },
        handedOverBy: { select: { name: true } },
      },
    })

    return successResponse(
      {
        ...dispatchRecord,
        batchId: dispatchRecord.goldPour.id,
        batchCode: dispatchRecord.goldPour.pourBarId,
        goldPour: {
          ...dispatchRecord.goldPour,
          batchId: dispatchRecord.goldPour.id,
          batchCode: dispatchRecord.goldPour.pourBarId,
        },
        warnings: requiresOverride
          ? [
              `This batch already had ${existingDispatchCount} dispatch record(s). Override reason was recorded.`,
            ]
          : [],
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/dispatches error:", error)
    return errorResponse("Failed to create gold dispatch")
  }
}
