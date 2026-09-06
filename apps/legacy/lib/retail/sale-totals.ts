/**
 * Sale-level money that is derived rather than re-priced.
 *
 * `lib/retail/checkout.ts` prices a *new* basket and deliberately works in
 * `number`: it is shared with the offline till, which stores plain JSON, and
 * moving it to `Decimal` would ship decimal.js into that bundle. This module is
 * the server-side counterpart — it never runs on the till, so it can hold the
 * exact arithmetic the ledger needs.
 */
import type { Prisma } from "@corelithzw/db";

import { money, sumMoney, type MoneyLike } from "@/lib/money";

/**
 * The ex-VAT subtotal of a set of already-priced lines.
 *
 * For reversals — a refund or a void — whose lines are not re-priced but copied
 * from the sale being undone, pro-rated and negated. The figure has to land in
 * the same basis `calculateRetailCheckout` writes for a sale, because
 * `RetailSale.subtotal` is one column and the ledger reads it without asking
 * which kind of document produced it.
 *
 * ── The defect this replaces ───────────────────────────────────────────────
 *
 * `refundRetailSaleTransaction` built it as `Σ quantity × unitPrice`. That was
 * right while the shelf price was ex-VAT, and became wrong the moment S-3 made
 * the shelf price tax-inclusive: a sale's `subtotal` was then the carved-out
 * net, and a refund's was the gross. One column meaning two different things
 * depending on the document, so `subtotal − discount + tax = total` held on a
 * sale and broke on any day with a return.
 *
 * It reached the books. `ensureRetailSaleAccountingPosted` posts
 * `netAmount = |subtotal − discount|`, so every refund booked a revenue
 * reversal overstated by exactly its own VAT, and the journal's net plus tax
 * stopped equalling its gross.
 *
 * ── Why it is derived and not re-multiplied ────────────────────────────────
 *
 * From the identity the priced line already satisfies:
 *
 *   base − discount + tax = total   ⟹   base = total − tax + discount
 *
 * Re-multiplying a unit price is what let the two bases diverge in the first
 * place; reading the line's own figures back cannot, because they are the
 * numbers on the slip the customer was handed.
 *
 * Sign-agnostic: reversal lines arrive negative and the result is negative.
 */
export function reversalSubtotal(
  lines: Iterable<{ lineTotal: MoneyLike; taxAmount: MoneyLike; discountAmount: MoneyLike }>,
): Prisma.Decimal {
  return sumMoney(
    [...lines].map((line) =>
      money(line.lineTotal).minus(money(line.taxAmount)).plus(money(line.discountAmount)),
    ),
  );
}
