import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const allocation = await prisma.goldShiftAllocation.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, code: true, companyId: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        shiftReport: {
          select: {
            id: true,
            date: true,
            shift: true,
            outputTonnes: true,
            outputTrips: true,
            crewCount: true,
            groupLeader: { select: { id: true, name: true, employeeId: true } },
            shiftGroup: { select: { id: true, name: true } },
          },
        },
        expenses: { select: { id: true, type: true, weight: true } },
        workerShares: {
          select: {
            id: true,
            shareWeight: true,
            shareValueUsd: true,
            employee: {
              select: {
                id: true,
                name: true,
                employeeId: true,
                passportPhotoUrl: true,
              },
            },
          },
        },
        pours: {
          select: {
            id: true,
            pourBarId: true,
            grossWeight: true,
            valueUsd: true,
            pourDate: true,
            _count: {
              select: { receipts: true, dispatches: true, dispatchBatches: true },
            },
          },
        },
        employeePayments: {
          select: {
            id: true,
            employeeId: true,
            amountUsd: true,
            goldWeightGrams: true,
            status: true,
            dueDate: true,
            employee: {
              select: { name: true, employeeId: true, passportPhotoUrl: true },
            },
          },
        },
      },
    })

    if (!allocation || allocation.site.companyId !== session.user.companyId) {
      return errorResponse("Allocation not found", 404)
    }

    // Attendance for this shift
    const attendance = await prisma.attendance.findMany({
      where: {
        siteId: allocation.siteId,
        date: allocation.date,
        shift: allocation.shift,
      },
      select: {
        id: true,
        status: true,
        overtime: true,
        notes: true,
        employee: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            passportPhotoUrl: true,
            position: true,
          },
        },
      },
    })

    // Accounting events keyed by allocation id, expense ids, pour ids
    const expenseIds = allocation.expenses.map((e) => e.id)
    const pourIds = allocation.pours.map((p) => p.id)
    const sourceIds = [allocation.id, ...expenseIds, ...pourIds]

    const accountingEvents = await prisma.accountingIntegrationEvent.findMany({
      where: { sourceId: { in: sourceIds }, companyId: session.user.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceType: true,
        sourceAction: true,
        sourceId: true,
        status: true,
        amount: true,
        netAmount: true,
        entryDate: true,
        createdAt: true,
        journalEntryId: true,
      },
    })

    return successResponse({ ...allocation, attendance, accountingEvents })
  } catch (error) {
    console.error("[API] GET /api/gold/shift-allocations/[id] error:", error)
    return errorResponse("Failed to fetch allocation")
  }
}
