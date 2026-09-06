import { money, type MoneyLike } from "@/lib/money"

/**
 * Paying out an approved run.
 *
 * `derivePaidStatus` compares through `Decimal`, not `>=` on numbers: a batch
 * paid 1234.56 against 1234.56 must read PAID, and float comparison on money
 * assembled from several components does not reliably say so.
 */

export function derivePaidStatus(
  amount: MoneyLike,
  paidAmount?: MoneyLike,
): "DUE" | "PARTIAL" | "PAID" {
  const paid = money(paidAmount)
  if (paid.lessThanOrEqualTo(0)) return "DUE"
  if (paid.greaterThanOrEqualTo(money(amount))) return "PAID"
  return "PARTIAL"
}

export function generateDisbursementCode(date = new Date()) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const stamp = `${yyyy}${mm}${dd}`
  const suffix = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0")
  return `DB-${stamp}-${suffix}`
}
