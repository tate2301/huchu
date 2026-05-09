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

    const receipt = await prisma.buyerReceipt.findUnique({
      where: { id },
      include: {
        goldPour: {
          select: {
            id: true,
            pourBarId: true,
            grossWeight: true,
            valueUsd: true,
            pourDate: true,
            site: { select: { id: true, name: true, code: true, companyId: true } },
            goldShiftAllocation: {
              select: {
                id: true,
                date: true,
                shift: true,
                workerShareWeight: true,
                companyShareWeight: true,
              },
            },
          },
        },
        goldDispatch: {
          select: {
            id: true,
            dispatchDate: true,
            courier: true,
            destination: true,
            sealNumbers: true,
            goldPour: {
              select: {
                id: true,
                pourBarId: true,
                grossWeight: true,
                site: { select: { id: true, name: true, code: true, companyId: true } },
              },
            },
          },
        },
        // Aggregate join: every BuyerReceipt may cover N batches and N
        // dispatches. The legacy single-FK fields above remain populated
        // for backward-compat.
        batches: {
          select: {
            id: true,
            grams: true,
            valueUsd: true,
            goldPriceUsdPerGram: true,
            notes: true,
            createdAt: true,
            goldPour: {
              select: {
                id: true,
                pourBarId: true,
                grossWeight: true,
                pourDate: true,
                site: { select: { id: true, name: true, code: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        dispatches: {
          select: {
            id: true,
            createdAt: true,
            goldDispatch: {
              select: {
                id: true,
                dispatchDate: true,
                courier: true,
                destination: true,
                sealNumbers: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    if (!receipt) return errorResponse("Receipt not found", 404)

    const companyId =
      receipt.goldPour?.site.companyId ?? receipt.goldDispatch?.goldPour.site.companyId
    if (companyId !== session.user.companyId) {
      return errorResponse("Receipt not found", 404)
    }

    const accountingEvents = await prisma.accountingIntegrationEvent.findMany({
      where: { sourceId: receipt.id, companyId: session.user.companyId },
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

    return successResponse({ ...receipt, accountingEvents })
  } catch (error) {
    console.error("[API] GET /api/gold/receipts/[id] error:", error)
    return errorResponse("Failed to fetch receipt")
  }
}
