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

    const dispatch = await prisma.goldDispatch.findUnique({
      where: { id },
      include: {
        goldPour: {
          select: {
            id: true,
            pourBarId: true,
            grossWeight: true,
            valueUsd: true,
            site: { select: { id: true, name: true, code: true } },
          },
        },
        handedOverBy: { select: { id: true, name: true, employeeId: true } },
        batches: {
          orderBy: { sortOrder: "asc" },
          include: {
            goldPour: {
              select: {
                id: true,
                pourBarId: true,
                grossWeight: true,
                valueUsd: true,
                pourDate: true,
                site: { select: { name: true, code: true } },
              },
            },
          },
        },
        buyerReceipts: {
          select: {
            id: true,
            receiptNumber: true,
            receiptDate: true,
            paidAmount: true,
            paymentMethod: true,
            goldPourId: true,
          },
          orderBy: { receiptDate: "desc" },
        },
      },
    })

    if (!dispatch || dispatch.companyId !== session.user.companyId) {
      return errorResponse("Dispatch not found", 404)
    }

    const accountingEvents = await prisma.accountingIntegrationEvent.findMany({
      where: { sourceId: dispatch.id, companyId: session.user.companyId },
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

    return successResponse({
      ...dispatch,
      batchId: dispatch.goldPour.id,
      batchCode: dispatch.goldPour.pourBarId,
      accountingEvents,
    })
  } catch (error) {
    console.error("[API] GET /api/gold/dispatches/[id] error:", error)
    return errorResponse("Failed to fetch dispatch")
  }
}
