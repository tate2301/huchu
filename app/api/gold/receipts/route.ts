import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  hasRole,
  paginationResponse,
} from "@/lib/api-utils"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { recordInventoryEvent } from "@/lib/gold/inventory"
import { assertPeriodOpen, PeriodClosedError } from "@/lib/gold/period-close"
import { prisma } from "@/lib/prisma"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import { z } from "zod"
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator"
import { emitGoldDispatchReceiptedNotification } from "@/lib/notifications"

const buyerReceiptSchema = z
  .object({
    receiptNumber: z.string().min(1).max(50).optional(),
    goldDispatchId: z.string().uuid().optional(),
    goldPourId: z.string().uuid().optional(),
    receiptDate: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
    assayResult: z.number().min(0).optional(),
    paidAmount: z.number().min(0),
    paymentMethod: z.string().min(1).max(100),
    paymentChannel: z.string().max(100).optional(),
    paymentReference: z.string().max(100).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((value) => Boolean(value.goldDispatchId || value.goldPourId), {
    message: "Batch or dispatch is required",
    path: ["goldPourId"],
  })

const receiptInclude = {
  goldPour: {
    select: {
      id: true,
      pourBarId: true,
      createdAt: true,
      grossWeight: true,
      goldPriceUsdPerGram: true,
      valueUsd: true,
      pourDate: true,
      createdBy: { select: { id: true, name: true } },
      goldShiftAllocation: {
        select: {
          id: true,
          totalWeight: true,
          netWeight: true,
          workerShareWeight: true,
          companyShareWeight: true,
          expenses: { select: { id: true, type: true, weight: true } },
          shiftReport: {
            select: {
              id: true,
              groupLeader: { select: { name: true } },
            },
          },
        },
      },
      site: { select: { name: true, code: true } },
    },
  },
  goldDispatch: {
    include: {
      goldPour: {
        select: {
          id: true,
          pourBarId: true,
          createdAt: true,
          grossWeight: true,
          goldPriceUsdPerGram: true,
          valueUsd: true,
          pourDate: true,
          createdBy: { select: { id: true, name: true } },
          goldShiftAllocation: {
            select: {
              id: true,
              totalWeight: true,
              netWeight: true,
              workerShareWeight: true,
              companyShareWeight: true,
              expenses: { select: { id: true, type: true, weight: true } },
              shiftReport: {
                select: {
                  id: true,
                  groupLeader: { select: { name: true } },
                },
              },
            },
          },
          site: { select: { name: true, code: true } },
        },
      },
    },
  },
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
} as const

type BatchReference = {
  id: string
  pourBarId: string
  goldShiftAllocation?: {
    workerShareWeight: number | { toNumber(): number }
    companyShareWeight: number | { toNumber(): number }
    expenses: Array<{ weight: number | { toNumber(): number } }>
    shiftReport?: { groupLeader?: { name: string } | null } | null
  } | null
}

function toBatchRef<T extends BatchReference>(goldPour: T) {
  const expenseWeightTotal = goldPour.goldShiftAllocation
    ? goldPour.goldShiftAllocation.expenses.reduce((sum, expense) => sum + Number(expense.weight), 0)
    : null
  const workerSplitWeight = goldPour.goldShiftAllocation?.workerShareWeight != null ? Number(goldPour.goldShiftAllocation.workerShareWeight) : null
  const companySplitWeight = goldPour.goldShiftAllocation?.companyShareWeight != null ? Number(goldPour.goldShiftAllocation.companyShareWeight) : null
  const companyTotalWeight =
    companySplitWeight !== null && expenseWeightTotal !== null
      ? companySplitWeight + expenseWeightTotal
      : null

  return {
    ...goldPour,
    batchId: goldPour.id,
    batchCode: goldPour.pourBarId,
    expenseWeightTotal,
    workerSplitWeight,
    companySplitWeight,
    companyTotalWeight,
    shiftLeaderName:
      goldPour.goldShiftAllocation?.shiftReport?.groupLeader?.name ?? null,
  }
}

function normalizeReceipt<
  T extends {
    goldPour: {
      id: string
      pourBarId: string
      grossWeight: number | { toNumber(): number }
      pourDate: Date
      site: { name: string; code: string }
    } | null
    goldDispatch: {
      id: string
      dispatchDate: Date
      courier: string
      goldPour: {
        id: string
        pourBarId: string
        grossWeight: number | { toNumber(): number }
        pourDate: Date
        site: { name: string; code: string }
      }
    } | null
  },
>(receipt: T) {
  const basePour = receipt.goldPour ?? receipt.goldDispatch?.goldPour
  if (!basePour) return receipt

  return {
    ...receipt,
    goldPour: toBatchRef(basePour),
    goldDispatch: receipt.goldDispatch
      ? {
          ...receipt.goldDispatch,
          batchId: receipt.goldDispatch.goldPour.id,
          batchCode: receipt.goldDispatch.goldPour.pourBarId,
          goldPour: toBatchRef(receipt.goldDispatch.goldPour),
        }
      : null,
  }
}

function companyScope(companyId: string) {
  return { companyId }
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const goldDispatchId = searchParams.get("goldDispatchId")
    const goldPourId = searchParams.get("goldPourId")
    const { page, limit, skip } = getPaginationParams(request)

    const andFilters: Record<string, unknown>[] = [companyScope(session.user.companyId)]

    if (siteId) {
      andFilters.push({
        OR: [
          { goldPour: { is: { siteId } } },
          { goldDispatch: { is: { goldPour: { siteId } } } },
        ],
      })
    }

    if (goldDispatchId) andFilters.push({ goldDispatchId })
    if (goldPourId) {
      andFilters.push({
        OR: [
          { goldPourId },
          { goldDispatch: { is: { goldPourId } } },
        ],
      })
    }

    const where: Record<string, unknown> = { AND: andFilters }

    const [receipts, total] = await Promise.all([
      prisma.buyerReceipt.findMany({
        where,
        include: receiptInclude,
        orderBy: { receiptDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.buyerReceipt.count({ where }),
    ])

    const normalizedReceipts = receipts.map((receipt) => normalizeReceipt(receipt))

    return successResponse(paginationResponse(normalizedReceipts, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/gold/receipts error:", error)
    return errorResponse("Failed to fetch buyer receipts")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create buyer receipts", 403)
    }

    const body = await request.json()
    const validated = buyerReceiptSchema.parse(body)

    const dispatch = validated.goldDispatchId
      ? await prisma.goldDispatch.findUnique({
          where: { id: validated.goldDispatchId },
          include: {
            goldPour: { select: { id: true } },
            // Pull every batch in the dispatch so we can validate that
            // a chosen goldPourId is part of the trip — not just the
            // legacy primary pour.
            batches: { select: { goldPourId: true } },
          },
        })
      : null

    if (
      validated.goldDispatchId &&
      (!dispatch || dispatch.companyId !== session.user.companyId)
    ) {
      return errorResponse("Invalid dispatch", 403)
    }

    const resolvedGoldPourId = validated.goldPourId ?? dispatch?.goldPourId
    if (!resolvedGoldPourId) {
      return errorResponse("Batch is required", 400)
    }
    if (dispatch && validated.goldPourId) {
      const dispatchPourIds = new Set<string>([
        dispatch.goldPourId,
        ...dispatch.batches.map((b) => b.goldPourId),
      ])
      if (!dispatchPourIds.has(validated.goldPourId)) {
        return errorResponse(
          "Selected batch is not part of this dispatch",
          400,
        )
      }
    }

    const goldPour = await prisma.goldPour.findUnique({
      where: { id: resolvedGoldPourId },
      select: { id: true, companyId: true, grossWeight: true, siteId: true },
    })
    if (!goldPour || goldPour.companyId !== session.user.companyId) {
      return errorResponse("Invalid batch", 403)
    }

    const receiptDate = new Date(validated.receiptDate)
    try {
      await assertPeriodOpen(prisma, {
        companyId: session.user.companyId,
        siteId: goldPour.siteId,
        businessDate: receiptDate,
      })
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        return errorResponse(err.message, 409, {
          periodCloseId: err.periodCloseId,
          businessDate: receiptDate.toISOString().slice(0, 10),
        })
      }
      throw err
    }

    const existingBatchReceipt = await prisma.buyerReceipt.findFirst({
      where: {
        OR: [
          // Legacy single-FK matches
          { goldPourId: resolvedGoldPourId },
          { goldDispatch: { is: { goldPourId: resolvedGoldPourId } } },
          // New aggregate join — covers fifo-link receipts that span N pours
          { batches: { some: { goldPourId: resolvedGoldPourId } } },
        ],
      },
      select: { id: true },
    })
    if (existingBatchReceipt) {
      return errorResponse("Sale record already exists for this batch", 409)
    }

    const receiptNumber = validated.receiptNumber
      ? normalizeProvidedId(validated.receiptNumber, "GOLD_RECEIPT")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "GOLD_RECEIPT",
        })

    const duplicateReceiptNumber = await prisma.buyerReceipt.findFirst({
      where: {
        receiptNumber,
        AND: [companyScope(session.user.companyId)],
      },
      select: { id: true },
    })
    if (duplicateReceiptNumber) {
      return errorResponse("Receipt number already exists", 409)
    }

    const valuation = await snapshotGoldUsdValue({
      companyId: session.user.companyId,
      businessDate: validated.receiptDate,
      grams: Number(goldPour.grossWeight),
    })
    if (!valuation) {
      return errorResponse("No gold price configured. Add a gold price before recording sales.", 409)
    }

    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.buyerReceipt.create({
        data: {
          companyId: session.user.companyId,
          goldDispatchId: validated.goldDispatchId,
          goldPourId: resolvedGoldPourId,
          receiptNumber,
          receiptDate: new Date(validated.receiptDate),
          assayResult: validated.assayResult,
          paidAmount: validated.paidAmount,
          goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
          valuationDate: valuation.valuationDate,
          paymentMethod: validated.paymentMethod,
          paymentChannel: validated.paymentChannel,
          paymentReference: validated.paymentReference,
          notes: validated.notes,
        },
      })
      // Aggregate join: a single-pour sale becomes a 1-row BuyerReceiptBatch.
      // Future calls can submit N pours; we'll layer a multi-batch endpoint
      // when the UI surface lands.
      await tx.buyerReceiptBatch.create({
        data: {
          companyId: session.user.companyId,
          buyerReceiptId: created.id,
          goldPourId: resolvedGoldPourId,
          grams: Number(goldPour.grossWeight),
          valueUsd: validated.paidAmount,
          goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
        },
      })
      if (validated.goldDispatchId) {
        await tx.buyerReceiptDispatch.create({
          data: {
            buyerReceiptId: created.id,
            goldDispatchId: validated.goldDispatchId,
          },
        })
      }

      await recordInventoryEvent(tx, {
        companyId: session.user.companyId,
        siteId: goldPour.siteId,
        eventDate: created.receiptDate,
        direction: "OUT",
        grams: Number(goldPour.grossWeight),
        sourceType: "RECEIPT",
        sourceId: created.id,
        notes: `Sale ${receiptNumber}`,
        createdById: session.user.id,
        skipValuation: true,
      })

      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "GOLD_RECEIPT",
        sourceId: created.id,
        entryDate: created.receiptDate,
        description: `Gold receipt ${receiptNumber}`,
        createdById: session.user.id,
        amount: Number(created.paidAmount),
        netAmount: Number(created.paidAmount),
        taxAmount: 0,
        grossAmount: Number(created.paidAmount),
      }, tx)

      return tx.buyerReceipt.findUnique({
        where: { id: created.id },
        include: receiptInclude,
      })
    })
    if (!receipt) {
      return errorResponse("Failed to create receipt", 500)
    }

    if (validated.goldDispatchId && dispatch) {
      await emitGoldDispatchReceiptedNotification({
        companyId: session.user.companyId,
        dispatchId: validated.goldDispatchId,
        receiptId: receipt.id,
        handedOverById: dispatch.handedOverById,
      })
    }

    return successResponse(normalizeReceipt(receipt), 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/receipts error:", error)
    return errorResponse("Failed to create buyer receipt")
  }
}
