import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { ensureApproverRole } from "@/lib/workflow/approvals"
import { ensureAutoPeriods } from "@/lib/payroll-periods"
import { prisma } from "@corelithzw/db/client"

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.payroll", "create")
    if (denial) return errorResponse(denial, 403)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to seed payroll periods", 403)
    }

    // No body to read. Which periods get seeded is the company's payroll cycle
    // and horizon, not the caller's choice — the `domains` argument this used to
    // accept picked between a payroll and a gold-payout scope, and there is only
    // one kind of period now.
    const result = await ensureAutoPeriods(prisma, {
      companyId: session.user.companyId,
      createdById: session.user.id,
    })

    return successResponse(result, 201)
  } catch (error) {
    console.error("[API] POST /api/payroll/periods/seed error:", error)
    return errorResponse("Failed to seed payroll periods")
  }
}
