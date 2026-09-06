import type { Prisma, SettlementSource } from "@corelithzw/db"
import { money, rate, sumMoney, ZERO } from "@corelithzw/platform/money"
import { derivePaidStatus } from "@/lib/payroll/disbursements"

/**
 * Turning an approved settlement into money out the door.
 *
 * What this replaces: `applyDisbursementToGoldShares` in `lib/gold/payouts.ts`,
 * which read `EmployeePayment` rows filtered on `payoutSource: "GOLD"` and
 * apportioned a USD payment across gram weights in floating point, because
 * `EmployeePayment.amount` held grams on a gold row and money on every other row.
 * It also had to find the rows at all, which it did by matching a settlement-mode
 * date window — the same window the run had already used to select them.
 *
 * None of that is needed now. A `SettlementRun` aggregates per employee at
 * compute time, a `SettlementBatchItem` is one employee's share of one batch, and
 * the payment is one row against that item. Quantity and money are separate
 * columns, so nothing is apportioned and nothing crosses out of `Decimal`.
 */

export type BatchItemForPayment = {
  id: string
  employeeId: string
  amount: Prisma.Decimal
  paidAmount: Prisma.Decimal | null
  paidAt: Date | null
  currency: string
  lineId: string
  line: {
    quantity: Prisma.Decimal
    unit: string
    unitRate: Prisma.Decimal
  }
  notes: string | null
}

export type BatchForPayment = {
  id: string
  code: string
  companyId: string
  settlementRunId: string
  run: {
    source: SettlementSource
    periodStart: Date
    periodEnd: Date
    dueDate: Date
  }
}

/**
 * Record what an employee was paid for a settlement.
 *
 * Idempotent on `(batchItemId)` — marking a batch paid twice updates the payment
 * rather than writing a second one, because a batch can be re-marked after a
 * correction and two rows would double the employee's settled total.
 *
 * The paid *quantity* is derived from the paid money at the line's own rate, so a
 * half-paid settlement shows half the grams as settled. Deriving it the other way
 * — quantity first, then money — would let a rate change restate history.
 */
export async function recordSettlementPayment(
  tx: Prisma.TransactionClient,
  args: {
    item: BatchItemForPayment
    batch: BatchForPayment
    createdById: string
  },
): Promise<void> {
  const { item, batch, createdById } = args

  const amount = money(item.amount)
  const paidAmount = item.paidAmount === null ? null : money(item.paidAmount)
  const quantity = rate(item.line.quantity)

  // Settled quantity in proportion to settled money. Zero money paid settles zero
  // quantity even when the line has grams on it.
  const paidQuantity =
    paidAmount === null || amount.isZero()
      ? rate(0)
      : rate(quantity.times(paidAmount.dividedBy(amount)))

  const existing = await tx.settlementPayment.findFirst({
    where: { batchItemId: item.id },
    select: { id: true },
  })

  const data = {
    companyId: batch.companyId,
    employeeId: item.employeeId,
    source: batch.run.source,
    settlementRunId: batch.settlementRunId,
    lineId: item.lineId,
    batchId: batch.id,
    batchItemId: item.id,
    quantity,
    unit: item.line.unit,
    valuationDate: batch.run.periodEnd,
    unitPrice: item.line.unitRate,
    amount,
    paidAmount,
    currency: item.currency,
    periodStart: batch.run.periodStart,
    periodEnd: batch.run.periodEnd,
    dueDate: batch.run.dueDate,
    paidAt: paidQuantity.isZero() ? null : item.paidAt,
    status: derivePaidStatus(amount, paidAmount ?? ZERO),
    notes: item.notes ?? `Settlement batch ${batch.code}`,
  }

  if (existing) {
    await tx.settlementPayment.update({ where: { id: existing.id }, data })
    return
  }

  await tx.settlementPayment.create({ data: { ...data, createdById } })
}

/**
 * What an employee still has coming, per source.
 *
 * Sums money owed against money paid across every settlement. This is what the
 * gold and scrap dashboards were reading `EmployeePayment` for.
 */
export async function outstandingSettlementsByEmployee(
  db: Prisma.TransactionClient,
  input: { companyId: string; source?: SettlementSource; employeeIds?: string[] },
) {
  const payments = await db.settlementPayment.findMany({
    where: {
      companyId: input.companyId,
      ...(input.source ? { source: input.source } : {}),
      ...(input.employeeIds ? { employeeId: { in: input.employeeIds } } : {}),
    },
    select: {
      employeeId: true,
      source: true,
      currency: true,
      amount: true,
      paidAmount: true,
      quantity: true,
      unit: true,
    },
  })

  const byEmployee = new Map<
    string,
    {
      employeeId: string
      source: SettlementSource
      currency: string
      owed: Prisma.Decimal
      paid: Prisma.Decimal
      outstanding: Prisma.Decimal
      quantity: Prisma.Decimal
      unit: string
    }
  >()

  for (const payment of payments) {
    // Keyed by currency too: an employee settled in both USD and ZWG has two
    // balances, and adding them would produce a number in no currency at all.
    const key = `${payment.employeeId}:${payment.source}:${payment.currency}`
    const current = byEmployee.get(key) ?? {
      employeeId: payment.employeeId,
      source: payment.source,
      currency: payment.currency,
      owed: ZERO,
      paid: ZERO,
      outstanding: ZERO,
      quantity: rate(0),
      unit: payment.unit,
    }
    const owed = sumMoney([current.owed, payment.amount])
    const paid = sumMoney([current.paid, payment.paidAmount ?? ZERO])
    byEmployee.set(key, {
      ...current,
      owed,
      paid,
      outstanding: money(owed.minus(paid)),
      quantity: current.quantity.plus(rate(payment.quantity)),
      unit: payment.unit || current.unit,
    })
  }

  return [...byEmployee.values()]
}
