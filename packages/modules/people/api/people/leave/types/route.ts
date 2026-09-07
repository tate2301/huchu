import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "../../../../hr/permissions"
import { seedZimbabweLeavePack } from "../../../../people/leave/zimbabwe-pack"
import { prisma } from "@corelithzw/db/client"

/**
 * The leave types in force.
 *
 * Effective-dated like `PayeTable`, and read the same way: started on or before
 * the date asked about, not ended by it. The newest revision of a code wins, so a
 * company that cut annual leave from 22 to 20 sees 20 without the old row
 * disappearing from the months it governed.
 */

const querySchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const typeSchema = z.object({
  code: z.string().trim().min(1).max(32).toUpperCase(),
  name: z.string().trim().min(1).max(120),
  unit: z.enum(["DAY", "HALF_DAY", "HOUR"]).optional(),
  accrualMethod: z
    .enum(["ANNUAL_GRANT", "MONTHLY_ACCRUAL", "ANNIVERSARY_GRANT", "UNLIMITED"])
    .optional(),
  defaultEntitlement: z.number().nonnegative(),
  isPaid: z.boolean().optional(),
  requiresDocumentAfterDays: z.number().int().positive().nullable().optional(),
  carryOverLimit: z.number().nonnegative().nullable().optional(),
  carryOverExpiresOn: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  policyNote: z.string().trim().max(500).nullable().optional(),
  effectiveFrom: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.leave", "view")
    if (denial) return errorResponse(denial, 403)

    const parsed = querySchema.safeParse({
      asOf: request.nextUrl.searchParams.get("asOf") ?? undefined,
    })
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.issues)
    }
    const asOf = parsed.data.asOf ? new Date(parsed.data.asOf) : new Date()
    const companyId = session.user.companyId

    // A workspace that has just enabled leave has no types. Seeding on read means
    // the screen shows the Labour Act starting set rather than an empty page that
    // looks like a bug.
    await seedZimbabweLeavePack({ companyId })

    const rows = await prisma.leaveType.findMany({
      where: {
        companyId,
        isActive: true,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
    })

    // Two revisions can both cover a date when one starts mid-window. The newest
    // wins, matching how the balance computation reads them.
    const newest = new Map<string, (typeof rows)[number]>()
    for (const row of rows) if (!newest.has(row.code)) newest.set(row.code, row)

    return successResponse({ asOf: asOf.toISOString(), types: [...newest.values()] })
  } catch (error) {
    console.error("[API] GET /api/people/leave/types error:", error)
    return errorResponse("Failed to load leave types")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    // Changing what everybody is entitled to is a configure action, not an edit.
    const denial = hrPermissionDenial(session, "hr.leave", "configure")
    if (denial) return errorResponse(denial, 403)

    const validated = typeSchema.parse(await request.json())
    const created = await prisma.leaveType.create({
      data: {
        companyId: session.user.companyId,
        code: validated.code,
        name: validated.name,
        unit: validated.unit ?? "DAY",
        accrualMethod: validated.accrualMethod ?? "ANNUAL_GRANT",
        defaultEntitlement: validated.defaultEntitlement,
        isPaid: validated.isPaid ?? true,
        requiresDocumentAfterDays: validated.requiresDocumentAfterDays ?? null,
        carryOverLimit: validated.carryOverLimit ?? null,
        carryOverExpiresOn: validated.carryOverExpiresOn ?? null,
        policyNote: validated.policyNote ?? null,
        effectiveFrom: new Date(validated.effectiveFrom),
      },
    })
    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/people/leave/types error:", error)
    return errorResponse("Failed to create leave type")
  }
}
