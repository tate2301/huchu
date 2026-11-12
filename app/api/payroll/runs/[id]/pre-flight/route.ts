import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const denial = hrPermissionDenial(session, "hr.payroll", "view")
    if (denial) return errorResponse(denial, 403)

    const { id } = await params
    const companyId = session.user.companyId

    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        period: {
          select: { id: true, periodKey: true, startDate: true, endDate: true, status: true },
        },
        lineItems: {
          select: {
            id: true,
            employeeId: true,
            compensationProfileId: true,
            baseAmount: true,
            grossAmount: true,
            netAmount: true,
            employee: {
              select: {
                id: true,
                employeeId: true,
                name: true,
                bankAccountNumber: true,
                bankName: true,
                mobileMoneyNumber: true,
                mobileMoneyProvider: true,
                taxNumber: true,
                nssaNumber: true,
              },
            },
          },
        },
      },
    })

    if (!run || run.companyId !== companyId) {
      return errorResponse("Payroll run not found", 404)
    }

    // Pending adjustments check
    const pendingAdjustments = await prisma.adjustmentEntry.count({
      where: {
        payrollRunId: id,
        status: { in: ["DRAFT", "SUBMITTED"] },
      },
    })

    // Check 1: Missing payment/disbursement accounts
    const missingPaymentDetails = run.lineItems
      .filter(
        (li) =>
          !li.employee.bankAccountNumber?.trim() &&
          !li.employee.mobileMoneyNumber?.trim(),
      )
      .map((li) => ({
        employeeId: li.employee.id,
        code: li.employee.employeeId,
        name: li.employee.name,
      }))

    // Check 2: Missing statutory identifiers
    const missingStatutory = run.lineItems
      .filter((li) => !li.employee.taxNumber?.trim() || !li.employee.nssaNumber?.trim())
      .map((li) => ({
        employeeId: li.employee.id,
        code: li.employee.employeeId,
        name: li.employee.name,
        missingTax: !li.employee.taxNumber?.trim(),
        missingNssa: !li.employee.nssaNumber?.trim(),
      }))

    // Check 3: Unassigned or zero base compensation profiles
    const unassignedProfiles = run.lineItems
      .filter((li) => !li.compensationProfileId || Number(li.baseAmount) <= 0)
      .map((li) => ({
        employeeId: li.employee.id,
        code: li.employee.employeeId,
        name: li.employee.name,
        baseAmount: Number(li.baseAmount),
      }))

    // Check 4: Pending unapproved leave requests overlapping period
    const pendingLeave = await prisma.leaveRequest.findMany({
      where: {
        companyId,
        status: "SUBMITTED",
        startDate: { lte: run.period.endDate },
        endDate: { gte: run.period.startDate },
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
        leaveType: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "asc" },
      take: 20,
    })

    const pendingLeaveList = pendingLeave.map((lr) => ({
      id: lr.id,
      employeeId: lr.employee.id,
      code: lr.employee.employeeId,
      name: lr.employee.name,
      leaveType: lr.leaveType.name,
      startDate: lr.startDate.toISOString().slice(0, 10),
      endDate: lr.endDate.toISOString().slice(0, 10),
      workingDays: Number(lr.workingDays),
    }))

    // Check 5: Net pay variance outliers (>30% variance and >$50 delta from last closed run)
    const previousRun = await prisma.payrollRun.findFirst({
      where: {
        companyId,
        id: { not: run.id },
        status: { in: ["APPROVED", "POSTED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        lineItems: {
          select: { employeeId: true, netAmount: true },
        },
      },
    })

    const prevNetMap = new Map<string, number>()
    if (previousRun) {
      for (const li of previousRun.lineItems) {
        prevNetMap.set(li.employeeId, Number(li.netAmount))
      }
    }

    const varianceOutliers: Array<{
      employeeId: string
      code: string
      name: string
      currentNet: number
      previousNet: number
      deltaAmount: number
      deltaPercent: number
    }> = []

    if (prevNetMap.size > 0) {
      for (const li of run.lineItems) {
        const prev = prevNetMap.get(li.employeeId)
        if (prev !== undefined && prev > 0) {
          const current = Number(li.netAmount)
          const delta = current - prev
          const pct = (delta / prev) * 100
          if (Math.abs(pct) >= 30 && Math.abs(delta) >= 50) {
            varianceOutliers.push({
              employeeId: li.employee.id,
              code: li.employee.employeeId,
              name: li.employee.name,
              currentNet: current,
              previousNet: prev,
              deltaAmount: delta,
              deltaPercent: Math.round(pct * 10) / 10,
            })
          }
        }
      }
    }

    // Blocker / Warning triage
    const blockers: string[] = []
    if (run.lineItems.length === 0) {
      blockers.push("Payroll run has zero line items")
    }
    if (pendingAdjustments > 0) {
      blockers.push(`${pendingAdjustments} pending adjustment entries must be resolved first`)
    }
    if (missingPaymentDetails.length > 0) {
      blockers.push(`${missingPaymentDetails.length} employee(s) have no bank or mobile money account on file`)
    }

    const warnings: string[] = []
    if (missingStatutory.length > 0) {
      warnings.push(`${missingStatutory.length} employee(s) are missing tax (BP) or NSSA membership numbers`)
    }
    if (unassignedProfiles.length > 0) {
      warnings.push(`${unassignedProfiles.length} employee(s) have no compensation profile or zero base salary`)
    }
    if (pendingLeaveList.length > 0) {
      warnings.push(`${pendingLeaveList.length} submitted leave request(s) overlap this payroll period`)
    }
    if (varianceOutliers.length > 0) {
      warnings.push(`${varianceOutliers.length} employee(s) have >30% net pay variance from the prior cycle`)
    }

    let passedCount = 0
    if (run.lineItems.length > 0 && pendingAdjustments === 0) passedCount++
    if (missingPaymentDetails.length === 0) passedCount++
    if (missingStatutory.length === 0) passedCount++
    if (unassignedProfiles.length === 0) passedCount++
    if (pendingLeaveList.length === 0) passedCount++
    if (varianceOutliers.length === 0) passedCount++

    return successResponse({
      run: {
        id: run.id,
        runNumber: run.runNumber,
        status: run.status,
        netTotal: Number(run.netTotal),
        grossTotal: Number(run.grossTotal),
        lineCount: run.lineItems.length,
        periodKey: run.period.periodKey,
        periodRange: `${run.period.startDate.toISOString().slice(0, 10)} to ${run.period.endDate.toISOString().slice(0, 10)}`,
      },
      canSubmit: blockers.length === 0 && run.status === "DRAFT",
      blockers,
      warnings,
      passedCount,
      totalChecks: 6,
      details: {
        missingPaymentDetails,
        missingStatutory,
        unassignedProfiles,
        pendingLeaveList,
        varianceOutliers,
        pendingAdjustments,
      },
    })
  } catch (error) {
    console.error("[API] GET /api/payroll/runs/[id]/pre-flight error:", error)
    return errorResponse("Failed to perform pre-flight payroll reconciliation check")
  }
}
