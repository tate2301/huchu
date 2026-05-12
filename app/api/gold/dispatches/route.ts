import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  hasRole,
  paginationResponse,
} from "@/lib/api-utils"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { recordInventoryEvent } from "@/lib/gold/inventory"
import { assertPeriodOpen, PeriodClosedError } from "@/lib/gold/period-close"
import { goldPourCore } from "@/lib/gold/prisma-includes"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { createRequestLogger } from "@/lib/logging"

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

// Dispatch shape used by both the list and the create response. The
// `goldPour` blocks (top-level + per batch) reuse `goldPourCore` so any
// schema-level pour field added in one place flows through.
const dispatchInclude = {
  goldPour: goldPourCore,
  handedOverBy: { select: { name: true } },
  batches: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      goldPour: goldPourCore,
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
      companyId: session.user.companyId,
    }

    if (siteId) {
      where.goldPour = { siteId }
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
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId, { route: "POST /api/gold/dispatches" })
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create gold dispatches", 403)
    }

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
      include: { site: { select: { isActive: true } } },
    })

    if (goldPours.length !== goldPourIds.length) {
      return errorResponse("One or more batches were not found", 404)
    }

    for (const pour of goldPours) {
      if (pour.companyId !== session.user.companyId) {
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

    const distinctSiteIds = new Set(goldPours.map((p) => p.siteId))
    if (distinctSiteIds.size > 1) {
      return errorResponse(
        "All batches in a dispatch must come from the same site",
        400,
        { siteIds: Array.from(distinctSiteIds) },
      )
    }

    const handedOverBy = await prisma.employee.findUnique({
      where: { id: validated.handedOverById },
      select: { companyId: true, isActive: true },
    })
    if (!handedOverBy || handedOverBy.companyId !== session.user.companyId || !handedOverBy.isActive) {
      return errorResponse("Invalid handover user", 400)
    }

    const dispatchDate = new Date(validated.dispatchDate)
    const primarySiteId = goldPours[0]?.siteId ?? null
    try {
      await assertPeriodOpen(prisma, {
        companyId: session.user.companyId,
        siteId: primarySiteId,
        businessDate: dispatchDate,
      })
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        return errorResponse(err.message, 409, {
          periodCloseId: err.periodCloseId,
          businessDate: dispatchDate.toISOString().slice(0, 10),
        })
      }
      throw err
    }

    const notesSegments = [validated.notes?.trim()]
    if (validated.overrideReason?.trim()) {
      notesSegments.push(`Override reason: ${validated.overrideReason.trim()}`)
    }
    const mergedNotes = notesSegments.filter(Boolean).join("\n\n")

    const totalGrossWeight = goldPours.reduce((sum, pour) => sum + Number(pour.grossWeight), 0)
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
          companyId: session.user.companyId,
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
          companyId: session.user.companyId,
          dispatchId: created.id,
          goldPourId: pour.id,
          sortOrder: index,
        })),
      })

      for (const pour of orderedPours) {
        await recordInventoryEvent(tx, {
          companyId: session.user.companyId,
          siteId: pour.siteId,
          eventDate: new Date(validated.dispatchDate),
          direction: "OUT",
          grams: Number(pour.grossWeight),
          sourceType: "DISPATCH",
          sourceId: created.id,
          notes: `Dispatch ${created.id} (pour ${pour.pourBarId})`,
          createdById: session.user.id,
          goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
          valueUsd: +(Number(pour.grossWeight) * valuation.goldPriceUsdPerGram).toFixed(2),
          skipValuation: true,
        })
      }

      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "gold",
        sourceAction: "dispatch-created",
        sourceType: "GOLD_DISPATCH",
        sourceId: created.id,
        entryDate: new Date(validated.dispatchDate),
        description: `Gold dispatch ${created.id} for ${orderedPours.length} batch(es)`,
        amount: valuation.valueUsd ?? totalGrossWeight,
        payload: {
          goldPourIds,
          totalGrossWeight,
          valueUsd: valuation.valueUsd,
          goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
          valuationDate: valuation.valuationDate,
          destination: validated.destination,
          courier: validated.courier,
          sealNumbers: validated.sealNumbers,
        },
        createdById: session.user.id,
        status: "PENDING",
      }, tx)

      return tx.goldDispatch.findUniqueOrThrow({
        where: { id: created.id },
        include: dispatchInclude,
      })
    })

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
    log.error("dispatch creation failed", error instanceof Error ? error : undefined)
    return errorResponse("Failed to create gold dispatch")
  }
}
