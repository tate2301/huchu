import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import {
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
} from "@/lib/hr-payroll"

const rejectSchema = z.object({
  note: z.string().trim().min(1).max(1000),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params
    const body = await request.json()
    const validated = rejectSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to reject payroll runs", 403)
    }

    const existing = await prisma.payrollRun.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, submittedById: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Payroll run not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Only submitted payroll runs can be rejected", 400)
    }
    if (!isTwoStepActionAllowed(existing.submittedById, session.user.id)) {
      return errorResponse("Rejection must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.update({
        where: { id },
        data: {
          status: "DRAFT",
          notes: validated.note,
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "PAYROLL_RUN",
        entityId: id,
        action: "REJECT",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "DRAFT",
        note: validated.note,
      })

      return run
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/payroll/runs/[id]/reject error:", error)
    return errorResponse("Failed to reject payroll run")
  }
}
