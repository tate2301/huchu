import type { Prisma } from "@corelithzw/db"
import { createApprovalAction } from "@corelithzw/module-workflow/approvals"
import { generateSettlementRunCode, type SettlementRunDraft } from "./runs"

/**
 * Writing a computed draft down.
 *
 * One transaction, and the audit row goes in it. A run that exists without an
 * `ApprovalAction` recording who created it is a run nobody is accountable for,
 * and writing the audit afterwards means a crash between the two leaves exactly
 * that.
 */
export async function persistSettlementRun(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string
    draft: SettlementRunDraft
    periodStart: Date
    periodEnd: Date
    dueDate: Date
    baseCurrency: string
    createdById: string
    /** Replace an existing draft rather than refusing. */
    replaceRunId?: string
  },
) {
  const { draft } = input

  if (input.replaceRunId) {
    // Lines cascade; the run row is reused so its code and any external
    // reference to it survive a recompute.
    await tx.settlementLine.deleteMany({ where: { runId: input.replaceRunId } })
  }

  const run = input.replaceRunId
    ? await tx.settlementRun.update({
        where: { id: input.replaceRunId },
        data: {
          mode: draft.mode,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          dueDate: input.dueDate,
          currency: input.baseCurrency,
          ratePerUnit: draft.ratePerUnit,
          rateUnit: draft.rateUnit,
          totalQuantity: draft.totals.totalQuantity,
          totalAmount: draft.totals.totalAmount,
          status: "DRAFT",
          notes: draft.workflowNote,
        },
      })
    : await tx.settlementRun.create({
        data: {
          companyId: input.companyId,
          code: generateSettlementRunCode(draft.source, input.periodEnd),
          source: draft.source,
          mode: draft.mode,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          dueDate: input.dueDate,
          currency: input.baseCurrency,
          ratePerUnit: draft.ratePerUnit,
          rateUnit: draft.rateUnit,
          totalQuantity: draft.totals.totalQuantity,
          totalAmount: draft.totals.totalAmount,
          status: "DRAFT",
          notes: draft.workflowNote,
          createdById: input.createdById,
        },
      })

  for (const line of draft.lines) {
    const created = await tx.settlementLine.create({
      data: {
        runId: run.id,
        employeeId: line.employeeId,
        quantity: line.quantity,
        unit: line.unit,
        unitRate: line.unitRate,
        grossAmount: line.grossAmount,
        netAmount: line.netAmount,
        currency: line.currency,
        exchangeRate: line.exchangeRate,
        baseAmount: line.baseAmount,
        notes: line.notes,
      },
      select: { id: true },
    })

    if (line.origins.length > 0) {
      await tx.settlementLineOrigin.createMany({
        data: line.origins.map((origin) => ({
          lineId: created.id,
          goldShiftAllocationId: origin.goldShiftAllocationId ?? null,
          settlementIntakeId: origin.settlementIntakeId ?? null,
          quantity: origin.quantity,
          amount: origin.amount,
        })),
      })
    }
  }

  await createApprovalAction(tx, {
    companyId: input.companyId,
    entityType: "SETTLEMENT_RUN",
    entityId: run.id,
    action: input.replaceRunId ? "ADJUST" : "CREATE",
    actedById: input.createdById,
    toStatus: "DRAFT",
    note: draft.workflowNote,
  })

  return run
}

/**
 * Upstream records already settled in another run.
 *
 * Called before computing, so the same gold allocation cannot be settled twice.
 * Draft runs count: a draft is about to be approved, and letting a second draft
 * claim the same grams means whichever is approved second silently overpays.
 *
 * A rejected run releases its claim — that is what rejecting it was for.
 */
export async function alreadySettledOriginIds(
  db: Prisma.TransactionClient,
  input: { companyId: string; excludeRunId?: string },
) {
  const origins = await db.settlementLineOrigin.findMany({
    where: {
      line: {
        run: {
          companyId: input.companyId,
          ...(input.excludeRunId ? { id: { not: input.excludeRunId } } : {}),
          status: { not: "REJECTED" },
        },
      },
    },
    select: { goldShiftAllocationId: true, settlementIntakeId: true },
  })

  return {
    goldShiftAllocationIds: new Set(
      origins.map((origin) => origin.goldShiftAllocationId).filter((id): id is string => Boolean(id)),
    ),
    settlementIntakeIds: new Set(
      origins.map((origin) => origin.settlementIntakeId).filter((id): id is string => Boolean(id)),
    ),
  }
}
