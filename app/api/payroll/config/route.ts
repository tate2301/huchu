import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { ensureApproverRole } from "@/lib/hr-payroll"

const updateSchema = z
  .object({
    payrollCycle: z.enum(["MONTHLY", "FORTNIGHTLY"]).optional(),
    goldPayoutCycle: z.enum(["MONTHLY", "FORTNIGHTLY"]).optional(),
    goldSettlementMode: z.enum(["CURRENT_PERIOD", "NEXT_PERIOD"]).optional(),
    cashDisbursementOnly: z.boolean().optional(),
    autoGeneratePayrollPeriods: z.boolean().optional(),
    autoGenerateGoldPayoutPeriods: z.boolean().optional(),
    periodGenerationHorizon: z.number().int().min(1).max(12).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, { message: "No fields provided" })

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: {
        id: true,
        name: true,
        payrollCycle: true,
        goldPayoutCycle: true,
        goldSettlementMode: true,
        cashDisbursementOnly: true,
        autoGeneratePayrollPeriods: true,
        autoGenerateGoldPayoutPeriods: true,
        periodGenerationHorizon: true,
      },
    })
    if (!company) {
      return errorResponse("Company not found", 404)
    }

    return successResponse(company)
  } catch (error) {
    console.error("[API] GET /api/payroll/config error:", error)
    return errorResponse("Failed to fetch payroll settings")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update payroll settings", 403)
    }

    const body = await request.json()
    const validated = updateSchema.parse(body)

    const updated = await prisma.company.update({
      where: { id: session.user.companyId },
      data: validated,
      select: {
        id: true,
        name: true,
        payrollCycle: true,
        goldPayoutCycle: true,
        goldSettlementMode: true,
        cashDisbursementOnly: true,
        autoGeneratePayrollPeriods: true,
        autoGenerateGoldPayoutPeriods: true,
        periodGenerationHorizon: true,
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/payroll/config error:", error)
    return errorResponse("Failed to update payroll settings")
  }
}
