import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { prisma } from "@/lib/prisma"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import { reserveIdentifier } from "@/lib/id-generator"
import { z } from "zod"

const batchReceiptSchema = z.object({
  goldDispatchId: z.string().uuid().optional(),
  receiptDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  paymentMethod: z.string().min(1).max(100),
  paymentChannel: z.string().max(100).optional(),
  paymentReference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        goldPourId: z.string().uuid(),
        assayResult: z.number().min(0).optional(),
        paidAmount: z.number().min(0),
      }),
    )
    .min(1)
    .max(50),
})

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = batchReceiptSchema.parse(body)

    const pourIds = Array.from(new Set(validated.items.map((item) => item.goldPourId)))
    if (pourIds.length !== validated.items.length) {
      return errorResponse("Each batch can only appear once per submission", 400)
    }

    const pours = await prisma.goldPour.findMany({
      where: { id: { in: pourIds } },
      select: { id: true, grossWeight: true, pourBarId: true, site: { select: { companyId: true } } },
    })
    if (pours.length !== pourIds.length) {
      return errorResponse("One or more batches were not found", 404)
    }
    for (const pour of pours) {
      if (pour.site.companyId !== session.user.companyId) {
        return errorResponse("Invalid batch", 403)
      }
    }

    if (validated.goldDispatchId) {
      const dispatch = await prisma.goldDispatch.findUnique({
        where: { id: validated.goldDispatchId },
        include: {
          goldPour: { select: { site: { select: { companyId: true } } } },
          batches: { select: { goldPourId: true } },
        },
      })
      if (!dispatch || dispatch.goldPour.site.companyId !== session.user.companyId) {
        return errorResponse("Invalid dispatch", 403)
      }
      const dispatchPourIds = new Set<string>([
        dispatch.goldPourId,
        ...dispatch.batches.map((b) => b.goldPourId),
      ])
      for (const pourId of pourIds) {
        if (!dispatchPourIds.has(pourId)) {
          return errorResponse("Batch is not part of the selected dispatch", 400)
        }
      }
    }

    const existingReceipts = await prisma.buyerReceipt.findMany({
      where: {
        OR: [
          { goldPourId: { in: pourIds } },
          { goldDispatch: { is: { goldPourId: { in: pourIds } } } },
        ],
      },
      select: { goldPourId: true, goldDispatch: { select: { goldPourId: true } } },
    })
    const alreadyReceiptedIds = new Set<string>()
    for (const receipt of existingReceipts) {
      if (receipt.goldPourId) alreadyReceiptedIds.add(receipt.goldPourId)
      if (receipt.goldDispatch?.goldPourId) alreadyReceiptedIds.add(receipt.goldDispatch.goldPourId)
    }
    const conflicts = pours.filter((pour) => alreadyReceiptedIds.has(pour.id))
    if (conflicts.length > 0) {
      return errorResponse(
        `Sale records already exist for: ${conflicts.map((c) => c.pourBarId).join(", ")}`,
        409,
      )
    }

    const pourLookup = new Map(pours.map((pour) => [pour.id, pour]))

    const created = await prisma.$transaction(async (tx) => {
      const results: Array<{ id: string }> = []
      let totalPaid = 0
      for (const item of validated.items) {
        const pour = pourLookup.get(item.goldPourId)!
        const valuation = await snapshotGoldUsdValue({
          companyId: session.user.companyId,
          businessDate: validated.receiptDate,
          grams: pour.grossWeight,
        })
        if (!valuation) {
          throw new Error("No gold price configured. Add a gold price before recording sales.")
        }
        const receiptNumber = await reserveIdentifier(tx, {
          companyId: session.user.companyId,
          entity: "GOLD_RECEIPT",
        })
        const receipt = await tx.buyerReceipt.create({
          data: {
            goldDispatchId: validated.goldDispatchId,
            goldPourId: item.goldPourId,
            receiptNumber,
            receiptDate: new Date(validated.receiptDate),
            assayResult: item.assayResult,
            paidAmount: item.paidAmount,
            goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
            valuationDate: valuation.valuationDate,
            paidValueUsd: item.paidAmount,
            paymentMethod: validated.paymentMethod,
            paymentChannel: validated.paymentChannel,
            paymentReference: validated.paymentReference,
            notes: validated.notes,
          },
        })
        results.push({ id: receipt.id })
        totalPaid += item.paidAmount
      }
      return { results, totalPaid }
    })

    for (const result of created.results) {
      try {
        const receipt = await prisma.buyerReceipt.findUnique({ where: { id: result.id } })
        if (!receipt) continue
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "GOLD_RECEIPT",
          sourceId: receipt.id,
          entryDate: receipt.receiptDate,
          description: `Gold receipt ${receipt.receiptNumber}`,
          createdById: session.user.id,
          amount: receipt.paidValueUsd ?? receipt.paidAmount,
          netAmount: receipt.paidValueUsd ?? receipt.paidAmount,
          taxAmount: 0,
          grossAmount: receipt.paidValueUsd ?? receipt.paidAmount,
        })
      } catch (error) {
        console.error("[Accounting] Gold batch receipt auto-post failed:", error)
      }
    }

    return successResponse(
      { count: created.results.length, ids: created.results.map((r) => r.id), totalPaid: created.totalPaid },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    if (error instanceof Error && error.message.includes("No gold price")) {
      return errorResponse(error.message, 409)
    }
    console.error("[API] POST /api/gold/receipts/batch error:", error)
    return errorResponse("Failed to create batch receipts")
  }
}
