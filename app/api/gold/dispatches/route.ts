import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const goldDispatchSchema = z
  .object({
    // Backward-compat: accept either single goldPourId or list goldPourIds.
    goldPourId: z.string().uuid().optional(),
    goldPourIds: z.array(z.string().uuid()).min(1).max(50).optional(),
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
  .refine((value) => Boolean(value.goldPourId || (value.goldPourIds && value.goldPourIds.length > 0)), {
    message: "At least one batch is required",
    path: ["goldPourIds"],
  })

const dispatchInclude = {
  goldPour: {
    select: {
      id: true,
      pourBarId: true,
      pourDate: true,
      grossWeight: true,
      goldPriceUsdPerGram: true,
      valueUsd: true,
      site: { select: { name: true, code: true } },
    },
  },
  handedOverBy: { select: { name: true } },
  batches: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      goldPour: {
        select: {
          id: true,
          pourBarId: true,
          pourDate: true,
          grossWeight: true,
          goldPriceUsdPerGram: true,
          valueUsd: true,
          site: { select: { name: true, code: true } },
        },
      },
    },
  },
} as const

function normalizeDispatch<
  T extends {
    goldPour: { id: string; pourBarId: string }
    batches: Array<{ goldPour: { id: string; pourBarId: string } }>
  },
>(dispatch: T) {
  return {
    ...dispatch,
    batchId: dispatch.goldPour.id,
    batchCode: dispatch.goldPour.pourBarId,
    goldPour: {
      ...dispatch.goldPour,
      batchId: dispatch.goldPour.id,
      batchCode: dispatch.goldPour.pourBarId,
    },
    batches: dispatch.batches.map((batch) => ({
      ...batch,
      batchId: batch.goldPour.id,
      batchCode: batch.goldPour.pourBarId,
      goldPour: {
        ...batch.goldPour,
        batchId: batch.goldPour.id,
        batchCode: batch.goldPour.pourBarId,
      },
    })),
  }
}

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
    if (goldPourId) {
      where.OR = [
        { goldPourId },
        { batches: { some: { goldPourId } } },
      ]
    }

    const [dispatches, total] = await Promise.all([
      prisma.goldDispatch.findMany({
        where,
        include: dispatchInclude,
        orderBy: { dispatchDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.goldDispatch.count({ where }),
    ])

    const normalizedDispatches = dispatches.map(normalizeDispatch)

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

    const requestedIds = validated.goldPourIds && validated.goldPourIds.length > 0
      ? validated.goldPourIds
      : validated.goldPourId
        ? [validated.goldPourId]
        : []
    const goldPourIds = Array.from(new Set(requestedIds))

    if (goldPourIds.length === 0) {
      return errorResponse("At least one batch is required", 400)
    }

    const goldPours = await prisma.goldPour.findMany({
      where: { id: { in: goldPourIds } },
      include: { site: { select: { companyId: true, isActive: true } } },
    })

    if (goldPours.length !== goldPourIds.length) {
      return errorResponse("One or more batches were not found", 404)
    }

    for (const pour of goldPours) {
      if (pour.site.companyId !== session.user.companyId) {
        return errorResponse("Invalid gold pour", 403)
      }
      if (!pour.site.isActive) {
        return errorResponse(`Site for batch ${pour.pourBarId} is not active`, 400)
      }
    }

    const existingDispatchesForBatches = await prisma.goldDispatchBatch.findMany({
      where: { goldPourId: { in: goldPourIds } },
      select: { goldPourId: true },
    })
    const legacyDispatches = await prisma.goldDispatch.findMany({
      where: { goldPourId: { in: goldPourIds } },
      select: { goldPourId: true },
    })
    const alreadyDispatchedIds = new Set<string>([
      ...existingDispatchesForBatches.map((entry) => entry.goldPourId),
      ...legacyDispatches.map((entry) => entry.goldPourId),
    ])

    const requiresOverride = alreadyDispatchedIds.size > 0
    if (requiresOverride && !validated.overrideReason?.trim()) {
      const conflictingCodes = goldPours
        .filter((pour) => alreadyDispatchedIds.has(pour.id))
        .map((pour) => pour.pourBarId)
      return errorResponse(
        `These batches already have a dispatch: ${conflictingCodes.join(", ")}. Add an override reason to continue.`,
        409,
        { requiresOverride: true, conflictingPourBarIds: conflictingCodes },
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

    const totalGrossWeight = goldPours.reduce((sum, pour) => sum + pour.grossWeight, 0)
    const valuation = await snapshotGoldUsdValue({
      companyId: session.user.companyId,
      businessDate: validated.dispatchDate,
      grams: totalGrossWeight,
    })
    if (!valuation) {
      return errorResponse("No gold price configured. Add a gold price before recording dispatches.", 409)
    }

    const orderedPours = goldPourIds
      .map((id) => goldPours.find((pour) => pour.id === id))
      .filter((pour): pour is (typeof goldPours)[number] => Boolean(pour))
    const primaryPourId = orderedPours[0].id

    const dispatchRecord = await prisma.$transaction(async (tx) => {
      const created = await tx.goldDispatch.create({
        data: {
          goldPourId: primaryPourId,
          dispatchDate: new Date(validated.dispatchDate),
          goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
          valuationDate: valuation.valuationDate,
          valueUsd: valuation.valueUsd,
          courier: validated.courier,
          vehicle: validated.vehicle,
          destination: validated.destination,
          sealNumbers: validated.sealNumbers,
          handedOverById: validated.handedOverById,
          receivedBy: validated.receivedBy,
          notes: mergedNotes || undefined,
        },
      })

      await tx.goldDispatchBatch.createMany({
        data: orderedPours.map((pour, index) => ({
          dispatchId: created.id,
          goldPourId: pour.id,
          sortOrder: index,
        })),
      })

      return tx.goldDispatch.findUniqueOrThrow({
        where: { id: created.id },
        include: dispatchInclude,
      })
    })

    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "gold",
        sourceAction: "dispatch-created",
        sourceType: "GOLD_DISPATCH",
        sourceId: dispatchRecord.id,
        entryDate: dispatchRecord.dispatchDate,
        description: `Gold dispatch ${dispatchRecord.id} for ${orderedPours.length} batch(es)`,
        amount: dispatchRecord.valueUsd ?? totalGrossWeight,
        payload: {
          goldPourIds,
          totalGrossWeight,
          valueUsd: dispatchRecord.valueUsd,
          goldPriceUsdPerGram: dispatchRecord.goldPriceUsdPerGram,
          valuationDate: dispatchRecord.valuationDate,
          destination: dispatchRecord.destination,
          courier: dispatchRecord.courier,
          sealNumbers: dispatchRecord.sealNumbers,
        },
        createdById: session.user.id,
        status: "IGNORED",
      })
    } catch (error) {
      console.error("[Accounting] Gold dispatch capture failed:", error)
    }

    return successResponse(
      {
        ...normalizeDispatch(dispatchRecord),
        warnings: requiresOverride
          ? [
              `${alreadyDispatchedIds.size} batch(es) already had a dispatch record. Override reason was recorded.`,
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
