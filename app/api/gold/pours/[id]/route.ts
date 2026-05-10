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

    const pour = await prisma.goldPour.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, code: true } },
        witness1: { select: { id: true, name: true, employeeId: true } },
        witness2: { select: { id: true, name: true, employeeId: true } },
        createdBy: { select: { id: true, name: true } },
        purchase: {
          select: {
            id: true,
            purchaseNumber: true,
            sellerName: true,
            paidAmount: true,
            currency: true,
          },
        },
        goldShiftAllocation: {
          select: {
            id: true,
            date: true,
            shift: true,
            totalWeight: true,
            netWeight: true,
            workerShareWeight: true,
            companyShareWeight: true,
            workflowStatus: true,
            shiftReport: {
              select: {
                id: true,
                groupLeader: { select: { name: true } },
              },
            },
            expenses: { select: { id: true, type: true, weight: true } },
          },
        },
        dispatches: {
          select: {
            id: true,
            dispatchDate: true,
            courier: true,
            destination: true,
            sealNumbers: true,
            handedOverBy: { select: { name: true } },
          },
          orderBy: { dispatchDate: "desc" },
        },
        dispatchBatches: {
          select: {
            id: true,
            sortOrder: true,
            dispatch: {
              select: {
                id: true,
                dispatchDate: true,
                courier: true,
                destination: true,
              },
            },
          },
        },
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            receiptDate: true,
            paidAmount: true,
            paymentMethod: true,
          },
          orderBy: { receiptDate: "desc" },
        },
      },
    })

    if (!pour || pour.companyId !== session.user.companyId) {
      return errorResponse("Pour not found", 404)
    }

    const accountingEvents = await prisma.accountingIntegrationEvent.findMany({
      where: { sourceId: pour.id, companyId: session.user.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceType: true,
        sourceAction: true,
        status: true,
        amount: true,
        netAmount: true,
        entryDate: true,
        createdAt: true,
        journalEntryId: true,
      },
    })

    const inventoryEvents = await prisma.goldInventoryEvent.findMany({
      where: { sourceType: "POUR", sourceId: pour.id },
      orderBy: { eventDate: "asc" },
      select: { id: true, direction: true, grams: true, eventDate: true, valueUsd: true, notes: true },
    })

    return successResponse({
      ...pour,
      batchId: pour.id,
      batchCode: pour.pourBarId,
      accountingEvents,
      inventoryEvents,
    })
  } catch (error) {
    console.error("[API] GET /api/gold/pours/[id] error:", error)
    return errorResponse("Failed to fetch pour")
  }
}
