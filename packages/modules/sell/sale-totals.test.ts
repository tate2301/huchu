/**
 * A refund lands in the same basis as the sale it reverses.
 *
 * The defect: `RetailSale.subtotal` is written by two different code paths. A
 * sale's comes from `calculateRetailCheckout`, which on a tax-inclusive shelf
 * price reports the *carved-out* ex-VAT figure. A refund's was built as
 * `Σ quantity × unitPrice` — the shelf price itself, VAT included. One column,
 * two meanings, decided by which kind of document you happened to be looking at.
 *
 * It was not cosmetic. `ensureRetailSaleAccountingPosted` posts
 * `netAmount = |subtotal − discount|`, so every refund booked a revenue
 * reversal overstated by exactly its own VAT.
 *
 * These tests price a real basket through the sale path and then reverse it,
 * and assert the two agree to the cent. Everything is `Decimal`; there is no
 * `toBeCloseTo` here, for the same reason there is none in `cash-up.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { money } from "@corelithzw/platform/money";
import { calculateRetailCheckout } from "./checkout";
import { reversalSubtotal } from "./sale-totals";

/** The whole sale, handed back. Lines are copied and negated, never re-priced. */
function fullReversalOf(checkout: ReturnType<typeof calculateRetailCheckout>) {
  return checkout.lines.map((line) => ({
    lineTotal: money(line.lineTotal).negated(),
    taxAmount: money(line.taxAmount).negated(),
    discountAmount: money(line.discountAmount).negated(),
  }));
}

describe("reversing a sale priced off a VAT-inclusive shelf", () => {
  /**
   * Three Castle Lager 340ml at the $1.20 tag, 15% inclusive.
   *
   *   pays     3 × 1.20            = 3.60
   *   ex-VAT   3.60 ÷ 1.15         = 3.1304… → 3.13
   *   VAT      3.60 − 3.13         = 0.47
   *
   * The refund's subtotal must be −3.13, the ex-VAT figure. The old arithmetic
   * gave −3.60, and the 47c difference went to the ledger as revenue.
   */
  it("gives back the ex-VAT subtotal, not the shelf price", () => {
    const sale = calculateRetailCheckout({
      lines: [{ id: "castle", quantity: 3, unitPrice: 1.2, taxPercent: 15, taxInclusive: true }],
    });

    expect(money(sale.subtotal).toFixed(2)).toBe("3.13");
    expect(money(sale.taxAmount).toFixed(2)).toBe("0.47");
    expect(money(sale.total).toFixed(2)).toBe("3.60");

    const refundSubtotal = reversalSubtotal(fullReversalOf(sale));
    expect(refundSubtotal.toFixed(2)).toBe("-3.13");

    // What the shelf-price multiplication used to produce, and the gap it left.
    const oldWay = money(1.2).times(3).negated();
    expect(oldWay.toFixed(2)).toBe("-3.60");
    expect(oldWay.minus(refundSubtotal).toFixed(2)).toBe("-0.47");
  });

  it("mirrors the sale exactly, so a full refund nets the day to nothing", () => {
    const sale = calculateRetailCheckout({
      lines: [
        { id: "castle", quantity: 3, unitPrice: 1.2, taxPercent: 15, taxInclusive: true },
        { id: "chibuku", quantity: 2, unitPrice: 1.05, taxPercent: 15, taxInclusive: true },
        { id: "gordons", quantity: 1, unitPrice: 18.5, taxPercent: 15, taxInclusive: true },
      ],
    });

    const refundSubtotal = reversalSubtotal(fullReversalOf(sale));
    expect(refundSubtotal.plus(money(sale.subtotal)).toFixed(2)).toBe("0.00");
  });

  it("holds the ledger identity, which is the whole point", () => {
    // `subtotal − discount + tax = total`, on the reversal as on the sale. This
    // is what broke, and it is what `ensureRetailSaleAccountingPosted` relies on
    // when it derives netAmount from subtotal and books tax beside it.
    const sale = calculateRetailCheckout({
      lines: [{ id: "savanna", quantity: 4, unitPrice: 2.3, taxPercent: 15, taxInclusive: true }],
      orderDiscountAmount: 0.8,
    });

    const lines = fullReversalOf(sale);
    const subtotal = reversalSubtotal(lines);
    const discount = money(sale.discountAmount).negated();
    const tax = money(sale.taxAmount).negated();
    const total = money(sale.total).negated();

    expect(subtotal.minus(discount).plus(tax).toFixed(2)).toBe(total.toFixed(2));
  });

  it("pro-rates a part refund without drifting off the identity", () => {
    // Two of the three bottles come back. The lines are pro-rated, not re-priced,
    // which is exactly the case where re-multiplying a unit price went wrong.
    const sale = calculateRetailCheckout({
      lines: [{ id: "castle", quantity: 3, unitPrice: 1.2, taxPercent: 15, taxInclusive: true }],
    });
    const line = sale.lines[0];
    const ratio = money(2).div(3);

    const partial = [
      {
        lineTotal: money(line.lineTotal).times(ratio).negated(),
        taxAmount: money(line.taxAmount).times(ratio).negated(),
        discountAmount: money(line.discountAmount).times(ratio).negated(),
      },
    ];

    const subtotal = reversalSubtotal(partial);
    const tax = money(line.taxAmount).times(ratio).negated();
    const total = money(line.lineTotal).times(ratio).negated();

    // 2.40 paid back, 0.31 of it VAT, 2.09 ex-VAT.
    expect(money(total).toFixed(2)).toBe("-2.40");
    expect(money(tax).toFixed(2)).toBe("-0.31");
    expect(subtotal.toFixed(2)).toBe("-2.09");
    expect(subtotal.plus(tax).toFixed(2)).toBe(money(total).toFixed(2));
  });

  it("leaves a tax-exclusive list alone", () => {
    // A wholesale list quotes ex-VAT and adds it at the till. The reversal
    // subtotal is then the quoted figure, and the same derivation still holds —
    // this function does not need to know which kind of list it came from.
    const sale = calculateRetailCheckout({
      lines: [{ id: "case", quantity: 1, unitPrice: 20, taxPercent: 15, taxInclusive: false }],
    });

    expect(money(sale.subtotal).toFixed(2)).toBe("20.00");
    expect(money(sale.total).toFixed(2)).toBe("23.00");
    expect(reversalSubtotal(fullReversalOf(sale)).toFixed(2)).toBe("-20.00");
  });
});
