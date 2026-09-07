import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "../../../hr/permissions"
import {
  computeNssaSchedule,
  computeP2,
  reconcileReturns,
} from "../../../hr/returns/monthly"

/**
 * The monthly statutory returns for one pay period.
 *
 * Computed on demand rather than stored. A return is a view of the approved
 * payroll runs for a period, and materialising it would create a second copy that
 * could disagree with the payslips — which is the failure the whole
 * summed-from-the-same-rows design avoids. If a run is corrected and re-approved,
 * the return follows without anybody remembering to regenerate it.
 *
 * `blockers` and `reconciliation` come back alongside the figures on purpose. An
 * operator about to file needs to know both whether the return can legally be
 * filed (every employee identified) and whether it agrees with the ledger — not
 * to discover either after submitting.
 */

const querySchema = z.object({
  // "2026-08". The period's own key, so a caller does not have to know its id.
  periodKey: z.string().regex(/^\d{4}-\d{2}(-H[12])?$/, {
    message: "periodKey must look like 2026-08",
  }),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.returns", "view")
    if (denial) return errorResponse(denial, 403)

    const parsed = querySchema.safeParse({
      periodKey: request.nextUrl.searchParams.get("periodKey") ?? "",
    })
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.issues)
    }

    const { periodKey } = parsed.data
    const companyId = session.user.companyId

    const [paye, nssa, reconciliation] = await Promise.all([
      computeP2({ companyId, periodKey }),
      computeNssaSchedule({ companyId, periodKey }),
      reconcileReturns({ companyId, periodKey }),
    ])

    return successResponse({
      periodKey,
      paye,
      nssa,
      reconciliation,
      // Flattened so a caller can decide whether to offer "file" at all without
      // walking two arrays.
      canFile:
        paye.every((row) => row.blockers.length === 0) &&
        nssa.every((row) => row.blockers.length === 0),
    })
  } catch (error) {
    console.error("[API] GET /api/payroll/returns error:", error)
    return errorResponse("Failed to compute statutory returns")
  }
}
