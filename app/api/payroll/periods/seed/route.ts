import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { ensureAutoPeriods } from "@/lib/payroll-periods"
import { prisma } from "@/lib/prisma"

const seedSchema = z.object({
  domains: z.array(z.enum(["PAYROLL", "GOLD_PAYOUT"])).min(1).max(2).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to seed payroll periods", 403)
    }

    let parsedBody: unknown = {}
    try {
      parsedBody = await request.json()
    } catch {
      parsedBody = {}
    }
    const validated = seedSchema.parse(parsedBody)

    const result = await ensureAutoPeriods(prisma, {
      companyId: session.user.companyId,
      createdById: session.user.id,
      domains: validated.domains,
    })

    return successResponse(result, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/payroll/periods/seed error:", error)
    return errorResponse("Failed to seed payroll periods")
  }
}
