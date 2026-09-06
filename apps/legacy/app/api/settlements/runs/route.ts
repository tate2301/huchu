import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { resolveBaseCurrency } from "@corelithzw/platform/money"
import { prisma } from "@corelithzw/db/client"
import { settlementPermissionDenial } from "@corelithzw/module-gold/settlements/permissions"
import { persistSettlementRun } from "@corelithzw/module-gold/settlements/persist"
import { buildSettlementRunDraft } from "@corelithzw/module-gold/settlements/runs"
import { parseSettlementSource } from "@corelithzw/module-gold/settlements/sources"

/**
 * Computing a settlement.
 *
 * POST is idempotent-ish by design: it refuses when an approved run already
 * covers the window, and replaces an existing *draft* only when asked. Silently
 * overwriting a draft would discard a recompute somebody was part-way through
 * reviewing; refusing outright would leave them unable to pick up a stale one.
 */

const dateInput = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const generateSchema = z.object({
  source: z.enum(["GOLD", "SCRAP", "COMMISSION", "OTHER"]),
  periodStart: dateInput,
  periodEnd: dateInput,
  dueDate: dateInput.optional(),
  mode: z.enum(["CURRENT_PERIOD", "NEXT_PERIOD"]).optional(),
  unit: z.string().trim().min(1).max(16).optional(),
  replaceDraft: z.boolean().optional(),
})

const RUN_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  lines: {
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { employee: { name: "asc" } },
  },
  _count: { select: { batches: true } },
} as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.run", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const source = parseSettlementSource(searchParams.get("source"))
    const status = searchParams.get("status")

    const where: Record<string, unknown> = { companyId: session.user.companyId }
    if (source) where.source = source
    if (["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED"].includes(status ?? "")) {
      where.status = status
    }

    const [records, total] = await Promise.all([
      prisma.settlementRun.findMany({
        where,
        include: RUN_INCLUDE,
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.settlementRun.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/settlements/runs error:", error)
    return errorResponse("Failed to fetch settlement runs")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.run", "create")
    if (denial) return errorResponse(denial, 403)

    const validated = generateSchema.parse(await request.json())
    const companyId = session.user.companyId
    const periodStart = new Date(validated.periodStart)
    const periodEnd = new Date(validated.periodEnd)
    if (periodEnd < periodStart) {
      return errorResponse("The period ends before it starts", 400)
    }

    const existing = await prisma.settlementRun.findFirst({
      where: {
        companyId,
        source: validated.source,
        periodStart,
        periodEnd,
        status: { not: "REJECTED" },
      },
      select: { id: true, code: true, status: true },
    })

    if (existing && existing.status !== "DRAFT") {
      return errorResponse(
        `${existing.code} already settles this period and is ${existing.status.toLowerCase()}`,
        409,
      )
    }
    if (existing && !validated.replaceDraft) {
      return errorResponse(
        `Draft ${existing.code} already covers this period. Recompute it to pick up new work.`,
        409,
        { runId: existing.id, code: existing.code },
      )
    }

    const baseCurrency = await resolveBaseCurrency(companyId)
    const draft = await buildSettlementRunDraft({
      companyId,
      source: validated.source,
      periodStart,
      periodEnd,
      mode: validated.mode ?? "CURRENT_PERIOD",
      baseCurrency,
      unit: validated.unit,
      excludeRunId: existing?.id,
    })

    if (!draft) {
      return errorResponse(
        "Nothing to settle for this period. Approved work is either already settled or has not been approved yet.",
        409,
      )
    }

    const run = await prisma.$transaction((tx) =>
      persistSettlementRun(tx, {
        companyId,
        draft,
        periodStart,
        periodEnd,
        // Defaults to the period end: a settlement with no stated due date is due
        // when the period it settles closes.
        dueDate: validated.dueDate ? new Date(validated.dueDate) : periodEnd,
        baseCurrency,
        createdById: session.user.id,
        replaceRunId: existing?.id,
      }),
    )

    const full = await prisma.settlementRun.findUnique({
      where: { id: run.id },
      include: RUN_INCLUDE,
    })

    return successResponse({ ...full, warnings: draft.warnings }, existing ? 200 : 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/settlements/runs error:", error)
    return errorResponse("Failed to generate settlement run")
  }
}
