import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
} from "@/lib/api-utils"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { recordInventoryEvent } from "@/lib/gold/inventory"
import { prisma } from "@/lib/prisma"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import { reserveIdentifier } from "@/lib/id-generator"
import { z } from "zod"

const batchReceiptSchema = z.object({
  goldDispatchId: z.string().uuid().optional(),
  // Optional: callers may attach the same payment to multiple dispatches.
  goldDispatchIds: z.array(z.string().uuid()).max(50).optional(),
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

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create batch receipts", 403)
    }

    const body = await request.json()
    const validated = batchReceiptSchema.parse(body)

    const pourIds = Array.from(new Set(validated.items.map((item) => item.goldPourId)))
    if (pourIds.length !== validated.items.length) {
      return errorResponse("Each batch can only appear once per submission", 400)
    }

    const pours = await prisma.goldPour.findMany({
      where: { id: { in: pourIds } },
      select: {
        id: true,
        companyId: true,
        grossWeight: true,
        pourBarId: true,
        siteId: true,
      },
    })
    if (pours.length !== pourIds.length) {
      return errorResponse("One or more batches were not found", 404)
    }
    for (const pour of pours) {
      if (pour.companyId !== session.user.companyId) {
        return errorResponse("Invalid batch", 403)
      }
    }
    // All items must come from the same site (one receipt = one site).
    const siteIds = new Set(pours.map((p) => p.siteId))
    if (siteIds.size > 1) {
      return errorResponse(
        "All batches in one receipt must belong to the same site",
        400,
      )
    }
    const headerSiteId = pours[0].siteId

    // Resolve dispatch IDs (legacy goldDispatchId + new goldDispatchIds).
    const dispatchIds = Array.from(
      new Set(
        [
          ...(validated.goldDispatchId ? [validated.goldDispatchId] : []),
          ...(validated.goldDispatchIds ?? []),
        ],
      ),
    )

    if (dispatchIds.length > 0) {
      const dispatches = await prisma.goldDispatch.findMany({
        where: { id: { in: dispatchIds } },
        include: {
          batches: { select: { goldPourId: true } },
        },
      })
      if (dispatches.length !== dispatchIds.length) {
        return errorResponse("Invalid dispatch", 403)
      }
      const dispatchPourIds = new Set<string>()
      for (const dispatch of dispatches) {
        if (dispatch.companyId !== session.user.companyId) {
          return errorResponse("Invalid dispatch", 403)
        }
        dispatchPourIds.add(dispatch.goldPourId)
        for (const b of dispatch.batches) dispatchPourIds.add(b.goldPourId)
      }
      // Every selected pour must be inside one of the chosen dispatches.
      for (const pourId of pourIds) {
        if (!dispatchPourIds.has(pourId)) {
          return errorResponse("Batch is not part of the selected dispatch", 400)
        }
      }
    }

    // Conflict guard: any pour that's already on another receipt blocks
    // this submission. We check all of: legacy goldPourId, dispatch
    // primary pour, and the new BuyerReceiptBatch join.
    const existingReceipts = await prisma.buyerReceipt.findMany({
      where: {
        OR: [
          { goldPourId: { in: pourIds } },
          { goldDispatch: { is: { goldPourId: { in: pourIds } } } },
          { batches: { some: { goldPourId: { in: pourIds } } } },
        ],
      },
      select: {
        goldPourId: true,
        goldDispatch: { select: { goldPourId: true } },
        batches: { select: { goldPourId: true } },
      },
    })
    const alreadyReceiptedIds = new Set<string>()
    for (const receipt of existingReceipts) {
      if (receipt.goldPourId) alreadyReceiptedIds.add(receipt.goldPourId)
      if (receipt.goldDispatch?.goldPourId) alreadyReceiptedIds.add(receipt.goldDispatch.goldPourId)
      for (const b of receipt.batches) alreadyReceiptedIds.add(b.goldPourId)
    }
    const conflicts = pours.filter((pour) => alreadyReceiptedIds.has(pour.id))
    if (conflicts.length > 0) {
      return errorResponse(
        `Sale records already exist for: ${conflicts.map((c) => c.pourBarId).join(", ")}`,
        409,
      )
    }

    const pourLookup = new Map(pours.map((pour) => [pour.id, pour]))

    // Sanity: a single price snapshot for the whole receipt — every batch
    // closes at the same business-date USD/g rate (gold prices are always
    // USD per the team).
    const headerValuation = await snapshotGoldUsdValue({
      companyId: session.user.companyId,
      businessDate: validated.receiptDate,
      grams: pours.reduce((sum, p) => sum + Number(p.grossWeight), 0),
    })
    if (!headerValuation) {
      return errorResponse(
        "No gold price configured. Add a gold price before recording sales.",
        409,
      )
    }

    const totalPaid = validated.items.reduce((sum, i) => sum + i.paidAmount, 0)

    const created = await prisma.$transaction(async (tx) => {
      const receiptNumber = await reserveIdentifier(tx, {
        companyId: session.user.companyId,
        entity: "GOLD_RECEIPT",
      })
      // Aggregate header receipt. The legacy goldDispatchId/goldPourId
      // fields are populated with the FIRST item / dispatch for backward
      // compatibility — every batch (and every dispatch) is mirrored in
      // the join tables.
      const receipt = await tx.buyerReceipt.create({
        data: {
          companyId: session.user.companyId,
          goldDispatchId: dispatchIds[0] ?? null,
          goldPourId: validated.items[0].goldPourId,
          receiptNumber,
          receiptDate: new Date(validated.receiptDate),
          paidAmount: totalPaid,
          paidValueUsd: totalPaid,
          goldPriceUsdPerGram: headerValuation.goldPriceUsdPerGram,
          valuationDate: headerValuation.valuationDate,
          paymentMethod: validated.paymentMethod,
          paymentChannel: validated.paymentChannel,
          paymentReference: validated.paymentReference,
          notes: validated.notes,
        },
      })

      for (const item of validated.items) {
        const pour = pourLookup.get(item.goldPourId)!
        await tx.buyerReceiptBatch.create({
          data: {
            companyId: session.user.companyId,
            buyerReceiptId: receipt.id,
            goldPourId: item.goldPourId,
            grams: pour.grossWeight,
            valueUsd: item.paidAmount,
            goldPriceUsdPerGram: headerValuation.goldPriceUsdPerGram,
            notes:
              item.assayResult != null
                ? `assayResult=${item.assayResult}`
                : null,
          },
        })
      }
      for (const dispatchId of dispatchIds) {
        await tx.buyerReceiptDispatch.create({
          data: {
            buyerReceiptId: receipt.id,
            goldDispatchId: dispatchId,
          },
        })
      }

      // OUT events per pour so receipt → event traceability matches FIFO sale path.
      for (const item of validated.items) {
        const pour = pourLookup.get(item.goldPourId)!
        await recordInventoryEvent(tx, {
          companyId: session.user.companyId,
          siteId: headerSiteId,
          eventDate: receipt.receiptDate,
          direction: "OUT",
          grams: Number(pour.grossWeight),
          sourceType: "RECEIPT",
          sourceId: receipt.id,
          notes: `Sale ${receiptNumber} (pour ${pour.pourBarId})`,
          createdById: session.user.id,
          goldPriceUsdPerGram: headerValuation.goldPriceUsdPerGram,
          valueUsd: item.paidAmount,
          skipValuation: true,
        })
      }

      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "GOLD_RECEIPT",
        sourceId: receipt.id,
        entryDate: receipt.receiptDate,
        description: `Gold receipt ${receiptNumber}`,
        createdById: session.user.id,
        amount: totalPaid,
        netAmount: totalPaid,
        taxAmount: 0,
        grossAmount: totalPaid,
      }, tx)

      return { receipt, totalPaid }
    })

    return successResponse(
      {
        count: 1,
        receiptId: created.receipt.id,
        // Back-compat with the prior shape: `ids` was the list of created
        // receipts. Now there's only one, but the field stays so any
        // existing callers don't break.
        ids: [created.receipt.id],
        batchCount: validated.items.length,
        totalPaid: created.totalPaid,
      },
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
