import type { CompensationCalcMethod } from "@corelithzw/db"
import { clampAtZero, minMoney, money, taxOn, type MoneyLike } from "@/lib/money"

/**
 * A single compensation rule, applied.
 *
 * `Decimal` throughout since the columns became `Decimal(14,2)`. The version this
 * replaces did `(baseAmount * value) / 100` in floating point and rounded
 * nowhere, so a 4.5% deduction on 1,234.56 produced 55.5552 and whatever the
 * next `+` made of it.
 *
 * A cap clamps the result, never the base — capping the base and then taking a
 * percentage of it gives a different, smaller number, and the NSSA ceiling is the
 * one place in this product where that distinction is the whole point (see
 * `contributionOn` in `lib/hr/statutory/tables.ts`, which caps the base
 * deliberately and says so).
 */
export function calculateRuleAmount(input: {
  baseAmount: MoneyLike
  calcMethod: CompensationCalcMethod
  value: MoneyLike
  cap?: MoneyLike
}) {
  const amount =
    input.calcMethod === "PERCENT"
      ? taxOn(input.baseAmount, input.value)
      : money(input.value)
  const capped =
    input.cap === null || input.cap === undefined
      ? amount
      : minMoney(amount, input.cap)
  return clampAtZero(capped)
}
