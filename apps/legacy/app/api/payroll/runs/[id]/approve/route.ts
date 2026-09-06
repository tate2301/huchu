import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { prisma } from "@corelithzw/db/client"
import { createApprovalAction, ensureApproverRole, isTwoStepActionAllowed } from "@/lib/workflow/approvals"
import { postPayrollRun } from "@/lib/hr/payroll/posting"
import { writePlatformAuditEvent } from "@corelithzw/platform/audit/platform"
import { createRouteLogger } from "@corelithzw/platform/observability/route-logger"

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
    const denial = hrPermissionDenial(session, "hr.payroll", "approve")
    if (denial) return errorResponse(denial, 403)
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
          // For the audit payload: how many people this run pays. A count rather
          // than the rows, since nothing here needs them.
          _count: { select: { lineItems: true } },
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

      // Inside the transaction, so the approval and its audit row commit
      // together or not at all. `ApprovalAction` records the workflow move;
      // this records it on the hash-chained `PlatformAuditEvent` chain, where it
      // cannot be edited afterwards without breaking every event behind it.
      //
      // Approving a payroll run is the moment a wage bill becomes owed to real
      // people and a tax liability becomes owed to the state. If any HR action
      // deserves a tamper-evident record, it is this one.
      await writePlatformAuditEvent(
        {
          companyId: session.user.companyId,
          actorId: session.user.id,
          eventType: "hr.payroll.run.approved",
          entityType: "PAYROLL_RUN",
          entityId: id,
          payload: {
            runNumber: run.runNumber,
            periodKey: run.period.periodKey,
            grossTotal: run.grossTotal.toFixed(2),
            netTotal: run.netTotal.toFixed(2),
            deductionsTotal: run.deductionsTotal.toFixed(2),
            employerCostTotal: run.employerCostTotal.toFixed(2),
            lineCount: run._count.lineItems,
          },
        },
        tx,
      )

      return run
    })

    // Posting is optional and the outcome is recorded either way.
    //
    // What was here posted three lines with no `currency` — so a ZWG employee's
    // figures landed in a USD ledger — credited every deduction to 2300 Goods
    // Received Not Invoiced, and swallowed any failure into a log line, leaving
    // the run looking posted when it was not. `postPayrollRun` posts one entry
    // per currency against the real statutory payable accounts, and stamps the
    // entry id or the reason on the run.
    {
      let outcome: Awaited<ReturnType<typeof postPayrollRun>>
      try {
        outcome = await postPayrollRun({
          companyId: session.user.companyId,
          runId: updated.id,
          runNumber: updated.runNumber,
          entryDate: updated.approvedAt ?? new Date(),
          createdById: session.user.id,
          enabledFeatures: session.user.enabledFeatures,
          actorRole: session.user.role,
        })
      } catch (error) {
        logger.error("payroll_auto_post_failed", error, {
          companyId: session.user.companyId,
          actorId: session.user.id,
          payrollRunId: updated.id,
        })
        outcome = {
          posted: false,
          reason: error instanceof Error ? error.message : "Posting failed.",
        }
      }

      await prisma.payrollRun.update({
        where: { id: updated.id },
        data: outcome.posted
          ? { journalEntryId: outcome.entryId, postingSkippedReason: null }
          : { journalEntryId: null, postingSkippedReason: outcome.reason.slice(0, 500) },
      })

      if (!outcome.posted) {
        logger.info("payroll_run_not_posted", {
          companyId: session.user.companyId,
          actorId: session.user.id,
          payrollRunId: updated.id,
          reason: outcome.reason,
        })
      }
    }

    logger.info("approve_run_success", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: updated.id,
      periodId: updated.period.id,
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
