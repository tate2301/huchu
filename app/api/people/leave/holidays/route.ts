import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { seedZimbabweLeavePack } from "@/lib/people/leave/zimbabwe-pack"
import { prisma } from "@/lib/prisma"

/**
 * The public holiday calendar for one year.
 *
 * Read by the leave screen and by the request route, which is why it is a real
 * endpoint rather than a lookup inside the page: the same calendar has to decide
 * what a request costs and what the operator sees, and two sources would disagree.
 */

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

const holidaySchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  name: z.string().trim().min(1).max(120),
  isPaid: z.boolean().optional(),
  doublePayIfWorked: z.boolean().optional(),
  siteId: z.string().uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.leave", "view")
    if (denial) return errorResponse(denial, 403)

    const parsed = querySchema.safeParse({
      year: request.nextUrl.searchParams.get("year") ?? undefined,
    })
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.issues)
    }

    const companyId = session.user.companyId
    const year = parsed.data.year ?? new Date().getUTCFullYear()

    // Seeds the fixed dates on first read, same as the types endpoint. A calendar
    // that starts empty means every leave range is charged in full and nobody
    // knows why.
    await seedZimbabweLeavePack({ companyId, year })

    const holidays = await prisma.publicHoliday.findMany({
      where: {
        companyId,
        date: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        },
      },
      orderBy: { date: "asc" },
    })

    return successResponse({ year, holidays })
  } catch (error) {
    console.error("[API] GET /api/people/leave/holidays error:", error)
    return errorResponse("Failed to load the holiday calendar")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    // Adding a holiday changes what leave costs for everybody, so it is a
    // configure action rather than an edit.
    const denial = hrPermissionDenial(session, "hr.leave", "configure")
    if (denial) return errorResponse(denial, 403)

    const validated = holidaySchema.parse(await request.json())
    const date = new Date(validated.date)

    if (validated.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: validated.siteId, companyId: session.user.companyId },
        select: { id: true },
      })
      if (!site) return errorResponse("Site not found", 404)
    }

    const created = await prisma.publicHoliday.create({
      data: {
        companyId: session.user.companyId,
        date,
        name: validated.name.trim(),
        isPaid: validated.isPaid ?? true,
        doublePayIfWorked: validated.doublePayIfWorked ?? false,
        siteId: validated.siteId ?? null,
      },
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/people/leave/holidays error:", error)
    return errorResponse("Failed to add the holiday")
  }
}
