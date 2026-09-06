import type { Prisma, SettlementMode, SettlementSource } from "@corelithzw/db"
import {
  money,
  rate,
  resolveExchangeRate,
  sumMoney,
  toBaseAmount,
  ZERO,
  type MoneyLike,
} from "@/lib/money"
import { prisma } from "@corelithzw/db/client"
import { alreadySettledOriginIds } from "@/lib/settlements/persist"

/**
 * Computing a settlement run.
 *
 * Two shapes of input, one output. Gold sums `GoldShiftWorkerShare` rows off
 * approved `GoldShiftAllocation`s; everything else sums `SettlementIntakeItem`
 * rows off approved intakes. Both produce lines carrying a quantity, a money
 * amount, and the rate that connects them.
 *
 * The rate is *derived*, never asked for. On a gold run each allocation already
 * carries the price its gold was valued at, so the run's `ratePerUnit` is the
 * weighted average of what actually happened — total money over total grams. An
 * operator typing a rate here would be restating a price that was already agreed
 * upstream, and the two would disagree the moment one of them changed.
 */

export type SettlementLineOriginDraft = {
  goldShiftAllocationId?: string
  settlementIntakeId?: string
  quantity: Prisma.Decimal
  amount: Prisma.Decimal
}

export type SettlementLineDraft = {
  employeeId: string
  quantity: Prisma.Decimal
  unit: string
  unitRate: Prisma.Decimal
  grossAmount: Prisma.Decimal
  netAmount: Prisma.Decimal
  currency: string
  exchangeRate: Prisma.Decimal
  baseAmount: Prisma.Decimal
  notes: string
  /// Which upstream records this line settled, so `SettlementLineOrigin` can be
  /// written and "is allocation X settled?" has an answer.
  origins: SettlementLineOriginDraft[]
}

export type SettlementRunDraft = {
  source: SettlementSource
  mode: SettlementMode
  lines: SettlementLineDraft[]
  totals: {
    totalQuantity: Prisma.Decimal
    totalAmount: Prisma.Decimal
  }
  ratePerUnit: Prisma.Decimal | null
  rateUnit: string
  workflowNote: string
  warnings: string[]
}

/** Gold allocations can be settled a pay cycle after the shift that earned them. */
const ALLOCATION_LOOKBACK_DAYS = 42

function deriveTotals(lines: SettlementLineDraft[]) {
  return {
    totalQuantity: lines.reduce((sum, line) => sum.plus(line.quantity), rate(0)),
    totalAmount: sumMoney(lines.map((line) => line.grossAmount)),
  }
}

function weightedRate(
  totalAmount: Prisma.Decimal,
  totalQuantity: Prisma.Decimal,
): Prisma.Decimal | null {
  // A run with no quantity has no rate. Returning zero would read as "free".
  if (totalQuantity.isZero()) return null
  return rate(totalAmount.dividedBy(totalQuantity))
}

async function currencyByEmployee(companyId: string, employeeIds: string[]) {
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, companyId },
    select: { id: true, defaultCurrency: true },
  })
  return new Map(employees.map((employee) => [employee.id, employee.defaultCurrency]))
}

async function buildIntakeRunDraft(input: {
  companyId: string
  source: SettlementSource
  periodStart: Date
  periodEnd: Date
  baseCurrency: string
  unit: string
  excludeRunId?: string
}): Promise<SettlementRunDraft | null> {
  const settled = await alreadySettledOriginIds(prisma, {
    companyId: input.companyId,
    excludeRunId: input.excludeRunId,
  })

  const approved = await prisma.settlementIntake.findMany({
    where: {
      companyId: input.companyId,
      source: input.source,
      workflowStatus: "APPROVED",
      dueDate: { gte: input.periodStart, lte: input.periodEnd },
      id: { notIn: [...settled.settlementIntakeIds] },
    },
    include: {
      items: { select: { employeeId: true, quantity: true, unit: true, amount: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  })

  const byEmployee = new Map<
    string,
    {
      quantity: Prisma.Decimal
      amount: Prisma.Decimal
      unit: string
      origins: SettlementLineOriginDraft[]
    }
  >()
  for (const intake of approved) {
    for (const item of intake.items) {
      const current = byEmployee.get(item.employeeId) ?? {
        quantity: rate(0),
        amount: ZERO,
        unit: item.unit,
        origins: [],
      }
      byEmployee.set(item.employeeId, {
        quantity: current.quantity.plus(rate(item.quantity)),
        amount: sumMoney([current.amount, item.amount]),
        unit: item.unit || current.unit,
        origins: [
          ...current.origins,
          {
            settlementIntakeId: intake.id,
            quantity: rate(item.quantity),
            amount: money(item.amount),
          },
        ],
      })
    }
  }

  const employeeIds = [...byEmployee.keys()]
  if (employeeIds.length === 0) return null

  const currencies = await currencyByEmployee(input.companyId, employeeIds)
  const lines: SettlementLineDraft[] = []
  const warnings: string[] = []

  for (const employeeId of employeeIds) {
    const totals = byEmployee.get(employeeId)!
    const currency = currencies.get(employeeId) ?? input.baseCurrency
    let exchangeRate = rate(1)
    try {
      exchangeRate = await resolveExchangeRate({
        companyId: input.companyId,
        baseCurrency: input.baseCurrency,
        currency,
        on: input.periodEnd,
      })
    } catch {
      // A missing rate does not stop the settlement — the amount is still owed in
      // its own currency. It stops the *journal* balancing, so say so once.
      warnings.push(
        `No ${input.baseCurrency}/${currency} rate for this period, so the ${currency} lines cannot be posted.`,
      )
    }

    lines.push({
      employeeId,
      quantity: totals.quantity,
      unit: totals.unit || input.unit,
      unitRate: weightedRate(totals.amount, totals.quantity) ?? rate(0),
      grossAmount: totals.amount,
      netAmount: totals.amount,
      currency,
      exchangeRate,
      baseAmount: toBaseAmount(totals.amount, exchangeRate),
      notes: `${totals.origins.length} approved ${totals.origins.length === 1 ? "intake" : "intakes"}.`,
      origins: totals.origins,
    })
  }

  const totals = deriveTotals(lines)
  return {
    source: input.source,
    mode: "CURRENT_PERIOD",
    lines,
    totals,
    ratePerUnit: weightedRate(totals.totalAmount, totals.totalQuantity),
    rateUnit: input.unit,
    workflowNote: `${input.source} settlement run generated from approved intakes.`,
    warnings: [...new Set(warnings)],
  }
}

async function buildGoldRunDraft(input: {
  companyId: string
  periodStart: Date
  periodEnd: Date
  mode: SettlementMode
  baseCurrency: string
  excludeRunId?: string
}): Promise<SettlementRunDraft | null> {
  // Grams already claimed by another run are not available to this one. Checked
  // here rather than left to the caller: a settlement path that forgets this
  // pays the same shift twice and nothing downstream notices.
  const settled = await alreadySettledOriginIds(prisma, {
    companyId: input.companyId,
    excludeRunId: input.excludeRunId,
  })

  const lookbackFloor = new Date(input.periodStart)
  lookbackFloor.setUTCDate(lookbackFloor.getUTCDate() - ALLOCATION_LOOKBACK_DAYS)

  const allocations = await prisma.goldShiftAllocation.findMany({
    where: {
      workflowStatus: "APPROVED",
      site: { companyId: input.companyId },
      date:
        input.mode === "CURRENT_PERIOD"
          ? { gte: input.periodStart, lte: input.periodEnd }
          : { gte: lookbackFloor, lte: input.periodEnd },
    },
    include: {
      workerShares: {
        select: { employeeId: true, shareWeight: true, shareValueUsd: true },
      },
    },
  })

  const byEmployee = new Map<
    string,
    {
      quantity: Prisma.Decimal
      amount: Prisma.Decimal
      origins: SettlementLineOriginDraft[]
    }
  >()

  for (const allocation of allocations) {
    // NEXT_PERIOD settles on the due date, which is the shift date plus the
    // allocation's own pay cycle — so a fortnightly worker's grams from the 20th
    // land in next month's run, not this one.
    const dueDate = new Date(allocation.date)
    dueDate.setUTCDate(dueDate.getUTCDate() + allocation.payCycleWeeks * 7)
    const settlesHere =
      input.mode === "CURRENT_PERIOD"
        ? allocation.date >= input.periodStart && allocation.date <= input.periodEnd
        : dueDate >= input.periodStart && dueDate <= input.periodEnd
    if (!settlesHere) continue
    if (settled.goldShiftAllocationIds.has(allocation.id)) continue

    const allocationPrice = allocation.goldPriceUsdPerGram
    for (const share of allocation.workerShares) {
      const current = byEmployee.get(share.employeeId) ?? {
        quantity: rate(0),
        amount: ZERO,
        origins: [] as SettlementLineOriginDraft[],
      }
      // The share's own valued amount wins. Falling back to weight × the
      // allocation price is for shares written before valuation ran.
      const shareAmount =
        share.shareValueUsd !== null
          ? money(share.shareValueUsd)
          : allocationPrice !== null
            ? money(rate(share.shareWeight).times(rate(allocationPrice)))
            : ZERO
      byEmployee.set(share.employeeId, {
        quantity: current.quantity.plus(rate(share.shareWeight)),
        amount: sumMoney([current.amount, shareAmount]),
        origins: [
          ...current.origins,
          {
            goldShiftAllocationId: allocation.id,
            quantity: rate(share.shareWeight),
            amount: shareAmount,
          },
        ],
      })
    }
  }

  const employeeIds = [...byEmployee.keys()]
  if (employeeIds.length === 0) return null

  const currencies = await currencyByEmployee(input.companyId, employeeIds)
  const warnings: string[] = []
  const lines: SettlementLineDraft[] = []

  for (const employeeId of employeeIds) {
    const totals = byEmployee.get(employeeId)!
    const currency = currencies.get(employeeId) ?? input.baseCurrency
    let exchangeRate = rate(1)
    try {
      exchangeRate = await resolveExchangeRate({
        companyId: input.companyId,
        baseCurrency: input.baseCurrency,
        currency,
        on: input.periodEnd,
      })
    } catch {
      warnings.push(
        `No ${input.baseCurrency}/${currency} rate for this period, so the ${currency} lines cannot be posted.`,
      )
    }

    const unitRate = weightedRate(totals.amount, totals.quantity)
    lines.push({
      employeeId,
      quantity: totals.quantity,
      unit: "g",
      unitRate: unitRate ?? rate(0),
      grossAmount: totals.amount,
      netAmount: totals.amount,
      currency,
      exchangeRate,
      baseAmount: toBaseAmount(totals.amount, exchangeRate),
      notes: unitRate
        ? `${totals.quantity.toFixed(3)} g at ${unitRate.toFixed(4)} per g across ${totals.origins.length} ${totals.origins.length === 1 ? "shift" : "shifts"}`
        : `${totals.quantity.toFixed(3)} g, not yet valued`,
      origins: totals.origins,
    })

    if (totals.amount.isZero() && !totals.quantity.isZero()) {
      warnings.push(
        "Some shares have grams but no valuation, so they settle at zero until the gold price is set.",
      )
    }
  }

  const totals = deriveTotals(lines)
  return {
    source: "GOLD",
    mode: input.mode,
    lines,
    totals,
    ratePerUnit: weightedRate(totals.totalAmount, totals.totalQuantity),
    rateUnit: "g",
    workflowNote: "Gold settlement run generated from approved shift allocations.",
    warnings: [...new Set(warnings)],
  }
}

/**
 * Build a run draft, or null when there is nothing to settle.
 *
 * Null rather than an empty run: an empty run is a record that somebody settled
 * nothing, which then has to be approved and cancelled.
 */
export function buildSettlementRunDraft(input: {
  companyId: string
  source: SettlementSource
  periodStart: Date
  periodEnd: Date
  mode: SettlementMode
  baseCurrency: string
  unit?: string
  /** Recomputing this run, so its own existing claims do not block it. */
  excludeRunId?: string
}): Promise<SettlementRunDraft | null> {
  if (input.source === "GOLD") {
    return buildGoldRunDraft({
      companyId: input.companyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      mode: input.mode,
      baseCurrency: input.baseCurrency,
      excludeRunId: input.excludeRunId,
    })
  }
  return buildIntakeRunDraft({
    companyId: input.companyId,
    source: input.source,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    baseCurrency: input.baseCurrency,
    unit: input.unit ?? "unit",
    excludeRunId: input.excludeRunId,
  })
}

/** `SET-GOLD-20260831-04812`. Sortable, and says what it is at a glance. */
export function generateSettlementRunCode(
  source: SettlementSource,
  periodEnd: Date,
  suffix?: number,
) {
  const yyyy = periodEnd.getUTCFullYear()
  const mm = String(periodEnd.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(periodEnd.getUTCDate()).padStart(2, "0")
  const tail = (suffix ?? Math.floor(Math.random() * 100000)).toString().padStart(5, "0")
  return `SET-${source}-${yyyy}${mm}${dd}-${tail}`
}

export function netIdentityHolds(line: {
  grossAmount: MoneyLike
  netAmount: MoneyLike
}) {
  // Settlements have no deductions today, so gross must equal net. Asserted so
  // that adding one cannot silently leave the two apart.
  return money(line.grossAmount).equals(money(line.netAmount))
}
