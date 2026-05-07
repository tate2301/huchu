import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"
import { createRouteLogger } from "@/lib/observability/route-logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createRouteLogger({
    route: "/api/payroll/runs/[id]/submit",
    request,
  })
  logger.info("start")

  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params
    logger.info("submit_run_requested", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: id,
    })

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to submit payroll runs", 403)
    }

    const existing = await prisma.payrollRun.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, periodId: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Payroll run not found", 404)
    }
    if (existing.status !== "DRAFT") {
      return errorResponse("Only draft payroll runs can be submitted", 400)
    }

    const [lineCount, pendingAdjustments] = await Promise.all([
      prisma.payrollLineItem.count({ where: { runId: id } }),
      prisma.adjustmentEntry.count({
        where: {
          payrollRunId: id,
          status: { in: ["DRAFT", "SUBMITTED"] },
        },
      }),
    ])
    if (lineCount === 0) {
      logger.info("submit_run_empty", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: id,
        statusCode: 400,
      })
      return errorResponse("Cannot submit payroll run without line items", 400)
    }
    if (pendingAdjustments > 0) {
      logger.info("submit_run_pending_adjustments", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: id,
        pendingAdjustments,
        statusCode: 409,
      })
      return errorResponse("Submit or resolve all pending adjustments before submitting run", 409)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
        },
        include: {
          period: {
            select: { id: true, periodKey: true, status: true },
          },
          submittedBy: { select: { id: true, name: true } },
        },
      })

      if (run.period.status === "DRAFT") {
        await tx.payrollPeriod.update({
          where: { id: run.period.id },
          data: {
            status: "SUBMITTED",
            submittedById: session.user.id,
            submittedAt: new Date(),
          },
        })
      }

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "PAYROLL_RUN",
        entityId: id,
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
      })

      return run
    })

    logger.info("submit_run_success", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: id,
      periodId: updated.period.id,
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      lineCount,
      statusCode: 200,
    })
    return successResponse(updated)
  } catch (error) {
    logger.error("submit_run_failed", error)
    return errorResponse("Failed to submit payroll run")
  }
}
