import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const applySchema = z.object({
  penaltyStatus: z.enum(["DEDUCTED", "PAID", "WAIVED"]).optional(),
  note: z.string().trim().max(1000).optional(),
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

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to apply disciplinary actions", 403)
    }

    const body = await request.json().catch(() => ({}))
    const validated = applySchema.parse(body)

    const existing = await prisma.disciplinaryAction.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        penaltyAmount: true,
        notes: true,
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disciplinary action not found", 404)
    }
    if (existing.status !== "APPROVED") {
      return errorResponse("Only approved disciplinary actions can be applied", 400)
    }

    const resolvedPenaltyStatus =
      existing.penaltyAmount > 0 ? validated.penaltyStatus ?? "DEDUCTED" : "NONE"

    const updated = await prisma.$transaction(async (tx) => {
      const action = await tx.disciplinaryAction.update({
        where: { id },
        data: {
          status: "APPLIED",
          appliedById: session.user.id,
          appliedAt: new Date(),
          penaltyStatus: resolvedPenaltyStatus,
          notes: validated.note
            ? `${existing.notes ? `${existing.notes}\n\n` : ""}Application note: ${validated.note}`
            : undefined,
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          incident: {
            select: {
              id: true,
              title: true,
              category: true,
              severity: true,
              status: true,
              incidentDate: true,
            },
          },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          appliedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "DISCIPLINARY_ACTION",
        entityId: id,
        action: "ADJUST",
        actedById: session.user.id,
        fromStatus: "APPROVED",
        toStatus: "APPLIED",
        note: validated.note,
      })

      return action
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/disciplinary-actions/[id]/apply error:", error)
    return errorResponse("Failed to apply disciplinary action")
  }
}
