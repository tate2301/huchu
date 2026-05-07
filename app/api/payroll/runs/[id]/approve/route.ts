import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import {
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
} from "@/lib/hr-payroll"
import { createRouteLogger } from "@/lib/observability/route-logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createRouteLogger({
    route: "/api/payroll/runs/[id]/approve",
    request,
  })
  logger.info("start")

  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params
    logger.info("approve_run_requested", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: id,
    })

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to approve payroll runs", 403)
    }

    const existing = await prisma.payrollRun.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        periodId: true,
        submittedById: true,
      },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Payroll run not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Payroll run must be submitted first", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const pendingAdjustments = await prisma.adjustmentEntry.count({
      where: {
        payrollRunId: id,
        status: { in: ["DRAFT", "SUBMITTED"] },
      },
    })
    if (pendingAdjustments > 0) {
      logger.info("approve_run_pending_adjustments", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: id,
        pendingAdjustments,
        statusCode: 409,
      })
      return errorResponse("Resolve pending adjustments before approving run", 409)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          period: { select: { id: true, periodKey: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      })

      await tx.payrollPeriod.update({
        where: { id: run.period.id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "PAYROLL_RUN",
        entityId: id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
      })

      return run
    })

    try {
      if (updated.domain !== "GOLD_PAYOUT") {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "PAYROLL_RUN",
          sourceId: updated.id,
          entryDate: updated.approvedAt ?? new Date(),
          description: `Payroll run #${updated.runNumber} approved`,
          createdById: session.user.id,
          amount: updated.netTotal,
          netAmount: updated.netTotal,
          taxAmount: 0,
          grossAmount: updated.grossTotal,
          deductionsAmount: updated.deductionsTotal,
          allowancesAmount: updated.allowancesTotal,
        })
      }
    } catch (error) {
      logger.error("payroll_auto_post_failed", error, {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: updated.id,
        domain: updated.domain,
      })
    }

    logger.info("approve_run_success", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: updated.id,
      periodId: updated.period.id,
      domain: updated.domain,
      fromStatus: "SUBMITTED",
      toStatus: "APPROVED",
      statusCode: 200,
    })
    return successResponse(updated)
  } catch (error) {
    logger.error("approve_run_failed", error)
    return errorResponse("Failed to approve payroll run")
  }
}
