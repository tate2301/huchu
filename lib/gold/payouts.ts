/**
 * Gold payouts — HR seam helpers. Lives under `lib/gold/` (Gold owns the
 * shape) but is OWNED by `gold-integration` per AGENTS.md because every
 * meaningful change crosses the Gold / HR / disbursements boundary. The
 * HR-side caller is `app/api/disbursements/batches/[id]/mark-paid/route.ts`
 * via `applyDisbursementToGoldShares`.
 *
 * If you find yourself touching this from inside `gold-domain-backend`,
 * stop and re-route — see the charter map in `.claude/agents/`.
 */
import type { Prisma } from "@prisma/client"
import { convertUsdToGrams } from "@/lib/gold/valuation"
import { derivePaidStatus } from "@/lib/hr-payroll"

const AUTO_PAYOUT_NOTE_PREFIX = "AUTO_PAYOUT_FROM_SHIFT_ALLOCATION:"
const AUTO_BATCH_NOTE_PREFIX = "AUTO_BATCH_FROM_SHIFT_ALLOCATION:"

export { AUTO_BATCH_NOTE_PREFIX, AUTO_PAYOUT_NOTE_PREFIX }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function extractAllocationIdFromPayoutNotes(notes: string | null | undefined) {
  if (!notes || !notes.startsWith(AUTO_PAYOUT_NOTE_PREFIX)) return null

  const remainder = notes.slice(AUTO_PAYOUT_NOTE_PREFIX.length).trim()
  const [candidate] = remainder.split(/\s+/)
  if (!candidate) return null
  return UUID_PATTERN.test(candidate) ? candidate : null
}

export function stripAllocationPrefixFromPayoutNotes(notes: string | null | undefined) {
  if (!notes) return ""
  if (!notes.startsWith(AUTO_PAYOUT_NOTE_PREFIX)) return notes.trim()

  const allocationId = extractAllocationIdFromPayoutNotes(notes)
  if (!allocationId) return notes.slice(AUTO_PAYOUT_NOTE_PREFIX.length).trim()

  return notes
    .slice(AUTO_PAYOUT_NOTE_PREFIX.length + allocationId.length)
    .trim()
}

export function buildGoldPayoutNotes(
  allocationId: string,
  notes: string | null | undefined,
) {
  const clean = stripAllocationPrefixFromPayoutNotes(notes)
  return clean
    ? `${AUTO_PAYOUT_NOTE_PREFIX}${allocationId} ${clean}`
    : `${AUTO_PAYOUT_NOTE_PREFIX}${allocationId}`
}

type DisbursementItemForGold = {
  id: string
  employeeId: string
  amount: number
  paidAmount: number | null
  paidAt: Date | null
  lineItemId: string | null
  lineItem: { currency: string; baseAmount: number; netAmount: number }
  notes: string | null
}

type BatchContextForGold = {
  id: string
  code: string
  payrollRunId: string
  payrollRun: {
    goldSettlementMode: string | null
    period: { startDate: Date; endDate: Date; dueDate: Date }
  }
}

export async function applyDisbursementToGoldShares(
  tx: Prisma.TransactionClient,
  args: {
    updatedItem: DisbursementItemForGold
    batch: BatchContextForGold
    createdById: string
  },
): Promise<void> {
  const { updatedItem, batch, createdById } = args

  const linkedGoldPayments = await tx.employeePayment.findMany({
    where: {
      employeeId: updatedItem.employeeId,
      goldShiftAllocationId: { not: null },
      payoutSource: "GOLD",
      ...(batch.payrollRun.goldSettlementMode === "NEXT_PERIOD"
        ? {
            dueDate: {
              gte: batch.payrollRun.period.startDate,
              lte: batch.payrollRun.period.endDate,
            },
          }
        : {
            periodStart: { lte: batch.payrollRun.period.endDate },
            periodEnd: { gte: batch.payrollRun.period.startDate },
          }),
    },
    orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
  })

  if (linkedGoldPayments.length > 0) {
    let remainingPaidUsd = updatedItem.paidAmount ?? 0

    for (const linked of linkedGoldPayments) {
      const amountUsd =
        linked.amountUsd ??
        ((linked.goldPriceUsdPerGram ?? 0) > 0
          ? linked.amount * (linked.goldPriceUsdPerGram ?? 0)
          : linked.amount)
      const paidAmountUsd =
        remainingPaidUsd > 0 ? Math.min(amountUsd, remainingPaidUsd) : 0
      remainingPaidUsd = Math.max(remainingPaidUsd - paidAmountUsd, 0)

      const sourceWeightGrams = linked.goldWeightGrams ?? linked.amount
      let paidGoldForRecord = 0
      if ((linked.goldPriceUsdPerGram ?? 0) > 0) {
        paidGoldForRecord = convertUsdToGrams({
          usd: paidAmountUsd,
          goldPriceUsdPerGram: linked.goldPriceUsdPerGram ?? 0,
        })
      } else if (amountUsd > 0 && sourceWeightGrams > 0) {
        paidGoldForRecord = (paidAmountUsd / amountUsd) * sourceWeightGrams
      }
      paidGoldForRecord = Math.max(0, Math.min(paidGoldForRecord, sourceWeightGrams))

      await tx.employeePayment.update({
        where: { id: linked.id },
        data: {
          amountUsd,
          paidAmountUsd: paidAmountUsd > 0 ? paidAmountUsd : null,
          goldWeightGrams: sourceWeightGrams,
          paidAmount: paidGoldForRecord > 0 ? paidGoldForRecord : null,
          paidAt: paidGoldForRecord > 0 ? updatedItem.paidAt : null,
          status: derivePaidStatus(amountUsd, paidAmountUsd),
          notes: linked.notes ?? `Gold disbursement batch ${batch.code}`,
          payrollRunId: batch.payrollRunId,
          payrollLineItemId: updatedItem.lineItemId,
          disbursementBatchId: batch.id,
          disbursementItemId: updatedItem.id,
        },
      })
    }
  } else {
    await tx.employeePayment.create({
      data: {
        employeeId: updatedItem.employeeId,
        type: "IRREGULAR",
        payoutSource: "GOLD",
        periodStart: batch.payrollRun.period.startDate,
        periodEnd: batch.payrollRun.period.endDate,
        dueDate: batch.payrollRun.period.dueDate,
        amount: updatedItem.lineItem.baseAmount,
        amountUsd: updatedItem.amount,
        unit: updatedItem.lineItem.currency,
        goldWeightGrams: updatedItem.lineItem.baseAmount,
        goldPriceUsdPerGram:
          updatedItem.lineItem.baseAmount > 0
            ? updatedItem.amount / updatedItem.lineItem.baseAmount
            : null,
        valuationDate: batch.payrollRun.period.endDate,
        paidAmount: updatedItem.paidAmount,
        paidAmountUsd: updatedItem.paidAmount,
        paidAt: updatedItem.paidAt,
        status: derivePaidStatus(updatedItem.amount, updatedItem.paidAmount ?? 0),
        notes: updatedItem.notes ?? `Gold disbursement batch ${batch.code}`,
        createdById,
        payrollRunId: batch.payrollRunId,
        payrollLineItemId: updatedItem.lineItemId,
        disbursementBatchId: batch.id,
        disbursementItemId: updatedItem.id,
      },
    })
  }
}
