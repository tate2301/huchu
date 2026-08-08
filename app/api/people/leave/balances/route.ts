import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { computeLeaveBalances } from "@/lib/people/leave/balances"
import { prisma } from "@/lib/prisma"

/**
 * What one employee has left.
 *
 * Derived on every read from the entitlement rows and the requests, which is the
 * whole point of not storing it. Cheap enough: one employee's leave year is a
 * handful of rows, and the alternative is a cached number that is wrong.
 *
 * `monthsElapsed` is computed here rather than inside the pure function so the
 * arithmetic stays testable without a clock. For a past year it is 12 — the year
 * finished, so everything accrued.
 */

const querySchema = z.object({
  employeeId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

function monthsElapsedIn(year: number, now: Date) {
  if (year < now.getUTCFullYear()) return 12
  if (year > now.getUTCFullYear()) return 0
  // The month in progress counts: somebody three days into March has accrued
  // March. Rounding it down would show a balance that jumps on the 1st.
  return now.getUTCMonth() + 1
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.leave", "view")
    if (denial) return errorResponse(denial, 403)

    const parsed = querySchema.safeParse({
      employeeId: request.nextUrl.searchParams.get("employeeId") ?? "",
      year: request.nextUrl.searchParams.get("year") ?? undefined,
    })
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.issues)
    }

    const companyId = session.user.companyId
    const now = new Date()
    const year = parsed.data.year ?? now.getUTCFullYear()

    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, companyId },
      select: { id: true, name: true, employeeId: true },
    })
    // Same answer for another company's employee as for one that does not exist.
    if (!employee) return errorResponse("Employee not found", 404)

    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))

    const [types, entitlements, requests] = await Promise.all([
      prisma.leaveType.findMany({
        where: {
          companyId,
          isActive: true,
          effectiveFrom: { lte: yearEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: yearStart } }],
        },
        orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
      }),
      prisma.leaveEntitlement.findMany({
        where: { companyId, employeeId: employee.id, year },
      }),
      prisma.leaveRequest.findMany({
        where: {
          companyId,
          employeeId: employee.id,
          startDate: { gte: yearStart, lte: yearEnd },
        },
        select: {
          leaveTypeId: true,
          status: true,
          workingDays: true,
          startDate: true,
        },
      }),
    ])

    const newest = new Map<string, (typeof types)[number]>()
    for (const type of types) if (!newest.has(type.code)) newest.set(type.code, type)

    const balances = computeLeaveBalances({
      year,
      leaveTypes: [...newest.values()],
      entitlements,
      requests,
      monthsElapsed: monthsElapsedIn(year, now),
    })

    return successResponse({ employee, year, balances })
  } catch (error) {
    console.error("[API] GET /api/people/leave/balances error:", error)
    return errorResponse("Failed to load leave balances")
  }
}
