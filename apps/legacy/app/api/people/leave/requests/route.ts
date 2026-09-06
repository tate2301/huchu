import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"
import {
  computeLeaveBalances,
  leaveAffordabilityDenial,
} from "@corelithzw/module-people/people/leave/balances"
import {
  countWorkingDays,
  holidayKeysForSite,
} from "@corelithzw/module-people/people/leave/working-days"
import { prisma } from "@corelithzw/db/client"
import { createApprovalAction } from "@corelithzw/module-workflow/approvals"

/**
 * Asking for time off.
 *
 * The working-day cost is computed here and frozen on the row. It is not
 * recomputed on read, and the reason is in `working-days.ts`: adding a public
 * holiday months later would otherwise restate every balance that ever spanned it,
 * including leave already taken and paid.
 *
 * Affordability is checked against a balance derived at the same moment, so two
 * requests submitted together cannot both fit into the last three days — the
 * second sees the first as pending.
 */

const dateInput = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const requestSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  startDate: dateInput,
  endDate: dateInput,
  isHalfDay: z.boolean().optional(),
  reason: z.string().trim().min(1).max(1000),
  attachmentUrl: z.string().url().max(500).optional(),
  coveringEmployeeId: z.string().uuid().optional(),
  /** Submit straight away rather than leaving a draft. */
  submit: z.boolean().optional(),
})

const REQUEST_INCLUDE = {
  employee: { select: { id: true, employeeId: true, name: true } },
  leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
  coveringEmployee: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.leave", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const employeeId = searchParams.get("employeeId")
    const status = searchParams.get("status")

    const where: Record<string, unknown> = { companyId: session.user.companyId }
    if (employeeId) where.employeeId = employeeId
    if (
      ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "WITHDRAWN"].includes(
        status ?? "",
      )
    ) {
      where.status = status
    }

    const [records, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.leaveRequest.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/people/leave/requests error:", error)
    return errorResponse("Failed to fetch leave requests")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.leave", "create")
    if (denial) return errorResponse(denial, 403)

    const validated = requestSchema.parse(await request.json())
    const companyId = session.user.companyId
    const startDate = new Date(validated.startDate)
    const endDate = new Date(validated.endDate)
    if (endDate < startDate) {
      return errorResponse("The leave ends before it starts", 400)
    }

    const [employee, leaveType] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: validated.employeeId, companyId },
        select: { id: true },
      }),
      prisma.leaveType.findFirst({
        where: { id: validated.leaveTypeId, companyId, isActive: true },
      }),
    ])
    if (!employee) return errorResponse("Employee not found", 404)
    if (!leaveType) return errorResponse("Leave type not found", 404)

    // Company-wide holidays only. `PublicHoliday.siteId` exists so a local
    // shutdown is expressible, but `Employee` has no site — attendance is
    // site-scoped, the person is not — so there is no way to say which site an
    // employee's holidays come from. Passing null means a site-specific holiday
    // is correctly ignored rather than silently applied to everybody, and the
    // per-site case waits for an employee-to-site link rather than being faked.
    const holidays = await prisma.publicHoliday.findMany({
      where: { companyId, date: { gte: startDate, lte: endDate } },
      select: { date: true, siteId: true },
    })
    const holidayKeys = holidayKeysForSite(holidays, null)

    const count = countWorkingDays({
      startDate,
      endDate,
      holidayKeys,
      isHalfDay: validated.isHalfDay,
    })

    if (count.workingDays.lessThanOrEqualTo(0)) {
      return errorResponse(
        `That range is ${count.restDays} rest day(s) and ${count.holidays} holiday(s) — no leave would be used`,
        400,
      )
    }

    if (
      leaveType.requiresDocumentAfterDays !== null &&
      count.workingDays.greaterThan(leaveType.requiresDocumentAfterDays) &&
      !validated.attachmentUrl
    ) {
      return errorResponse(
        `${leaveType.name} needs supporting documentation beyond ${leaveType.requiresDocumentAfterDays} day(s)`,
        400,
      )
    }

    const year = startDate.getUTCFullYear()
    const [entitlements, existing] = await Promise.all([
      prisma.leaveEntitlement.findMany({
        where: { companyId, employeeId: employee.id, year },
      }),
      prisma.leaveRequest.findMany({
        where: {
          companyId,
          employeeId: employee.id,
          startDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
          },
        },
        select: { leaveTypeId: true, status: true, workingDays: true, startDate: true },
      }),
    ])

    const [balance] = computeLeaveBalances({
      year,
      leaveTypes: [leaveType],
      entitlements,
      requests: existing,
    })
    const affordability = leaveAffordabilityDenial({
      balance,
      requestedDays: count.workingDays,
    })
    if (affordability) return errorResponse(affordability, 400)

    const status = validated.submit ? "SUBMITTED" : "DRAFT"
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.create({
        data: {
          companyId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          workingDays: count.workingDays,
          isHalfDay: Boolean(validated.isHalfDay),
          reason: validated.reason.trim(),
          attachmentUrl: validated.attachmentUrl,
          coveringEmployeeId: validated.coveringEmployeeId,
          status,
          createdById: session.user.id,
          submittedAt: validated.submit ? new Date() : null,
        },
        include: REQUEST_INCLUDE,
      })

      await createApprovalAction(tx, {
        companyId,
        entityType: "LEAVE_REQUEST",
        entityId: row.id,
        action: validated.submit ? "SUBMIT" : "CREATE",
        actedById: session.user.id,
        toStatus: status,
        note: `${leaveType.name}: ${count.workingDays.toString()} day(s)`,
      })

      return row
    })

    return successResponse({ ...created, dayCount: count }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/people/leave/requests error:", error)
    return errorResponse("Failed to create leave request")
  }
}
