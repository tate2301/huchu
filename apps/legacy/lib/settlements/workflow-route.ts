import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { prisma } from "@corelithzw/db/client"
import {
  settlementPermissionDenial,
  type SettlementResource,
} from "@/lib/settlements/permissions"
import {
  canTransitionStandardWorkflow,
  createApprovalAction,
  isTwoStepActionAllowed,
  normalizeWorkflowNote,
  type StandardWorkflowAction,
} from "@corelithzw/module-workflow/approvals"

/**
 * Submit, approve and reject, written once.
 *
 * The existing HR routes carry this logic three times per entity — the same
 * twelve lines of transition check, same-person check, update and audit write,
 * copy-pasted into `submit/`, `approve/` and `reject/`. Three copies drift: the
 * reject route for one entity checks `isTwoStepActionAllowed` and for another it
 * does not, and only reading all six tells you which.
 *
 * The route files stay — Next needs a file per path — but they are three lines
 * each and the decision lives here.
 */

const bodySchema = z.object({ note: z.string().trim().max(1000).optional() }).optional()

type WorkflowRow = {
  id: string
  companyId: string
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"
  submittedById: string | null
}

const NEXT_STATUS = {
  SUBMIT: "SUBMITTED",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
} as const

/** Why a transition was refused, in the operator's words rather than the enum's. */
const REFUSAL = {
  SUBMIT: "already submitted",
  APPROVE: "must be submitted before it can be approved",
  REJECT: "must be submitted before it can be rejected",
} as const

export function settlementWorkflowRoute(config: {
  action: StandardWorkflowAction
  resource: SettlementResource
  entityType: "SETTLEMENT_INTAKE" | "SETTLEMENT_RUN"
  /** What to call the thing in a message: "intake", "run". */
  noun: string
  loadRow: (id: string) => Promise<WorkflowRow | null>
  applyStatus: (args: {
    id: string
    status: "SUBMITTED" | "APPROVED" | "REJECTED"
    actorId: string
    tx: Parameters<typeof createApprovalAction>[0]
  }) => Promise<unknown>
}) {
  return async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const sessionResult = await validateSession(request)
      if (sessionResult instanceof NextResponse) return sessionResult
      const { session } = sessionResult

      const permission = config.action === "SUBMIT" ? "submit" : "approve"
      const denial = settlementPermissionDenial(session, config.resource, permission)
      if (denial) return errorResponse(denial, 403)

      const { id } = await params
      const parsed = bodySchema.safeParse(await request.json().catch(() => undefined))
      const note = parsed.success ? parsed.data?.note : undefined

      const existing = await config.loadRow(id)
      // Same answer for another company's record as for one that does not exist,
      // so probing for ids tells the caller nothing.
      if (!existing || existing.companyId !== session.user.companyId) {
        return errorResponse(`Settlement ${config.noun} not found`, 404)
      }
      if (!canTransitionStandardWorkflow(existing.workflowStatus, config.action)) {
        return errorResponse(`This ${config.noun} ${REFUSAL[config.action]}`, 400)
      }
      if (
        config.action !== "SUBMIT" &&
        !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
          allowSuperadminSelfAction: true,
        })
      ) {
        return errorResponse(
          `A ${config.noun} must be approved by someone other than the person who submitted it`,
          400,
        )
      }

      const status = NEXT_STATUS[config.action]
      const updated = await prisma.$transaction(async (tx) => {
        const row = await config.applyStatus({
          id,
          status,
          actorId: session.user.id,
          tx,
        })

        await createApprovalAction(tx, {
          companyId: session.user.companyId,
          entityType: config.entityType,
          entityId: id,
          action: config.action,
          actedById: session.user.id,
          fromStatus: existing.workflowStatus,
          toStatus: status,
          note: normalizeWorkflowNote(
            note,
            `${config.noun} ${config.action.toLowerCase()}ted`,
          ),
        })

        return row
      })

      return successResponse(updated)
    } catch (error) {
      console.error(
        `[API] POST settlement ${config.noun} ${config.action.toLowerCase()} error:`,
        error,
      )
      return errorResponse(`Failed to ${config.action.toLowerCase()} settlement ${config.noun}`)
    }
  }
}
