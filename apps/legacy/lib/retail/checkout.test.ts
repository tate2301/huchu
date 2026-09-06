/**
 * S-3 — what the customer pays, on a tax-inclusive shelf and on a tax-exclusive one.
 *
 * ## The bug this file pins down
 *
 * The bottle store's shelf list is `kind: RETAIL, taxInclusive: true` and its
 * tag on a Castle Lager 340ml says **$1.20**. In Zimbabwe that is the whole
 * price: the 15% VAT is inside it. `calculateRetailCheckout` was written to add
 * tax on top of the unit price, so the same bottle rang up at **$1.38** — the
 * seeded history is full of it (4 @ 1.20 → tax 0.72, line total 5.52). Tag and
 * till disagreed by 15%.
 *
 * Both arithmetics are now here and the *list* chooses between them, because
 * which one is right is a fact about the price list, not about the code.
 *
 * ## Every figure is hand-worked and stated
 *
 * Each case below writes out the division before it asserts the result, so a
 * future reader can check the number rather than trust it. Comparisons go
 * through `Prisma.Decimal.equals` and failures render both sides at two places:
 * no `===` on a double, no epsilon. `lib/money.ts` exists because
 * `Math.round((v + Number.EPSILON) * 100) / 100` is wrong at 8.575, and a
 * checkout test that tolerated a cent would pass on the drift it is here to
 * catch.
 *
 * The calculator itself stays in `number` — it is shared with the offline till,
 * which stores plain JSON and would otherwise have to ship decimal.js. That
 * boundary is deliberate and is what these assertions police.
 */

import { Prisma } from "@corelithzw/db";
import { describe, expect, it } from "vitest";

import { money } from "@corelithzw/platform/money";
import { calculateRetailCheckout } from "@/lib/retail/checkout";

/** Exact to the cent, with both sides legible when it fails. */
function expectExactly(actual: number, expected: string, what: string) {
  const got = money(actual);
  const want = new Prisma.Decimal(expected);
  expect(`${what} = ${(got.equals(want) ? want : got).toFixed(2)}`).toBe(
    `${what} = ${want.toFixed(2)}`,
  );
}

/**
 * The identity every downstream reader depends on.
 *
 * `_services.ts` posts `netAmount = subtotal − discountAmount` against
 * `taxAmount` and `grossAmount = totalAmount`, and a journal whose sides differ
 * is a journal the ledger refuses. It has to hold on both kinds of list, which
 * is why a tax-inclusive checkout reports its base and its discount ex-VAT and
 * only `total` in shelf money.
 */
function expectBalances(checkout: ReturnType<typeof calculateRetailCheckout>) {
  const net = money(checkout.subtotal).minus(money(checkout.discountAmount));
  expectExactly(
    Number(net.plus(money(checkout.taxAmount))),
    money(checkout.total).toFixed(2),
    "subtotal − discount + tax",
  );
}

describe("a 15%-inclusive shelf price is carved up, not marked up", () => {
  /**
   * Castle Lager 340ml, one bottle, tag $1.20.
   *
   *   ex-VAT  1.20 ÷ 1.15 = 1.0434782608…  → 1.04
   *   VAT     1.20 − 1.04                  = 0.16
   *   paid                                   1.20
   *
   * Cross-check the other way: 1.04 × 0.15 = 0.156 → 0.16. The two agree, which
   * they must, or the slip would not add up.
   */
  it("splits $1.20 into $1.04 and $0.16 and charges $1.20", () => {
    const checkout = calculateRetailCheckout({
      lines: [
        { id: "castle", quantity: 1, unitPrice: 1.2, taxPercent: 15, taxInclusive: true },
      ],
    });

    expectExactly(checkout.lines[0].baseAmount, "1.04", "ex-VAT line");
    expectExactly(checkout.lines[0].taxAmount, "0.16", "VAT");
    expectExactly(checkout.lines[0].lineTotal, "1.20", "line total");
    expectExactly(checkout.subtotal, "1.04", "subtotal");
    expectExactly(checkout.taxAmount, "0.16", "tax");
    expectExactly(checkout.total, "1.20", "total");
    expectBalances(checkout);
  });

  /**
   * The same bottle on a tax-exclusive list — the arithmetic this module has
   * always done, kept here as the regression guard. Nothing about an exclusive
   * list changed in S-3.
   *
   *   base    1.20 × 1     = 1.20
   *   VAT     1.20 × 0.15  = 0.18
   *   paid    1.20 + 0.18  = 1.38
   */
  it("adds 15% to $1.20 when the list is exclusive, exactly as before", () => {
    const checkout = calculateRetailCheckout({
      lines: [{ id: "castle", quantity: 1, unitPrice: 1.2, taxPercent: 15 }],
    });

    expectExactly(checkout.lines[0].baseAmount, "1.20", "base");
    expectExactly(checkout.lines[0].taxAmount, "0.18", "VAT");
    expectExactly(checkout.lines[0].lineTotal, "1.38", "line total");
    expectExactly(checkout.total, "1.38", "total");
    expectBalances(checkout);
  });

  /**
   * Castle Lager case of 24, tag $26.50.
   *
   *   ex-VAT  26.50 ÷ 1.15 = 23.0434782…  → 23.04
   *   VAT     26.50 − 23.04               = 3.46
   *   paid                                  26.50
   */
  it("splits a $26.50 case into $23.04 and $3.46", () => {
    const checkout = calculateRetailCheckout({
      lines: [{ id: "case", quantity: 1, unitPrice: 26.5, taxPercent: 15, taxInclusive: true }],
    });

    expectExactly(checkout.lines[0].baseAmount, "23.04", "ex-VAT line");
    expectExactly(checkout.lines[0].taxAmount, "3.46", "VAT");
    expectExactly(checkout.total, "26.50", "total");
    expectBalances(checkout);
  });

  /**
   * Quantity is applied before the split, not after — six bottles at $1.20 are
   * $7.20 on the counter, and $7.20 is what gets divided.
   *
   *   line 1  6 × 1.20 = 7.20;  7.20 ÷ 1.15 = 6.2608695… → 6.26;  VAT 0.94
   *   line 2  1 × 1.10 = 1.10;  1.10 ÷ 1.15 = 0.9565217… → 0.96;  VAT 0.14
   *   basket  ex-VAT 7.22, VAT 1.08, paid 8.30 ( = 7.20 + 1.10 )
   */
  it("prices a six-pack and a scud at what the two tags add up to", () => {
    const checkout = calculateRetailCheckout({
      lines: [
        { id: "castle", quantity: 6, unitPrice: 1.2, taxPercent: 15, taxInclusive: true },
        { id: "chibuku", quantity: 1, unitPrice: 1.1, taxPercent: 15, taxInclusive: true },
      ],
    });

    expectExactly(checkout.lines[0].baseAmount, "6.26", "castle ex-VAT");
    expectExactly(checkout.lines[0].taxAmount, "0.94", "castle VAT");
    expectExactly(checkout.lines[1].baseAmount, "0.96", "chibuku ex-VAT");
    expectExactly(checkout.lines[1].taxAmount, "0.14", "chibuku VAT");
    expectExactly(checkout.subtotal, "7.22", "subtotal");
    expectExactly(checkout.taxAmount, "1.08", "tax");
    expectExactly(checkout.total, "8.30", "total");
    expectBalances(checkout);
  });

  /** A zero-rated line is its own ex-VAT figure, on either kind of list. */
  it("leaves a zero-rated line alone", () => {
    const checkout = calculateRetailCheckout({
      lines: [{ id: "ice", quantity: 1, unitPrice: 1.5, taxPercent: 0, taxInclusive: true }],
    });

    expectExactly(checkout.subtotal, "1.50", "subtotal");
    expectExactly(checkout.taxAmount, "0.00", "tax");
    expectExactly(checkout.total, "1.50", "total");
    expectBalances(checkout);
  });
});

describe("discounts come off the shelf price, and the VAT follows", () => {
  /**
   * $2.50 off a $26.50 case. The customer hands over $24.00, so $24.00 is what
   * gets split — and the discount is reported ex-VAT so the books see the net
   * revenue and the output VAT fall together.
   *
   *   ex-VAT of the tag       26.50 ÷ 1.15 = 23.04
   *   ex-VAT of what is paid  24.00 ÷ 1.15 = 20.8695652… → 20.87
   *   discount, ex-VAT        23.04 − 20.87 = 2.17
   *   VAT                     24.00 − 20.87 = 3.13
   *   paid                                    24.00
   */
  it("takes $2.50 off a $26.50 case and still charges $24.00", () => {
    const checkout = calculateRetailCheckout({
      lines: [
        {
          id: "case",
          quantity: 1,
          unitPrice: 26.5,
          taxPercent: 15,
          taxInclusive: true,
          lineDiscountAmount: 2.5,
        },
      ],
    });

    expectExactly(checkout.lines[0].baseAmount, "23.04", "ex-VAT of the tag");
    expectExactly(checkout.lines[0].discountAmount, "2.17", "discount ex-VAT");
    expectExactly(checkout.lines[0].taxAmount, "3.13", "VAT");
    expectExactly(checkout.total, "24.00", "total");
    expectBalances(checkout);
  });

  /**
   * An order-level discount is allocated across the lines in shelf money — the
   * customer was promised 50c off the basket, not 50c off an ex-VAT figure
   * they never saw — and each line is then split.
   *
   *   allocation  castle  1.20 ÷ 2.30 × 0.50 = 0.2608… → 0.26
   *               chibuku remainder            0.50 − 0.26 = 0.24
   *   castle      pays 0.94;  0.94 ÷ 1.15 = 0.8173913… → 0.82;  VAT 0.12
   *   chibuku     pays 0.86;  0.86 ÷ 1.15 = 0.7478260… → 0.75;  VAT 0.11
   *   basket      ex-VAT 2.00, discount 0.43, VAT 0.23, paid 1.80 ( = 2.30 − 0.50 )
   */
  it("allocates a 50c order discount across two inclusive lines", () => {
    const checkout = calculateRetailCheckout({
      lines: [
        { id: "castle", quantity: 1, unitPrice: 1.2, taxPercent: 15, taxInclusive: true },
        { id: "chibuku", quantity: 1, unitPrice: 1.1, taxPercent: 15, taxInclusive: true },
      ],
      orderDiscountAmount: 0.5,
    });

    expectExactly(checkout.lines[0].taxAmount, "0.12", "castle VAT");
    expectExactly(checkout.lines[1].taxAmount, "0.11", "chibuku VAT");
    expectExactly(checkout.subtotal, "2.00", "subtotal");
    expectExactly(checkout.discountAmount, "0.43", "discount");
    expectExactly(checkout.taxAmount, "0.23", "tax");
    expectExactly(checkout.total, "1.80", "total");
    expectBalances(checkout);
  });

  /**
   * A percentage promotion is a percentage off the tag. 10% off $1.20 is 12c,
   * which is what the poster in the window says, and not 10% of $1.04.
   *
   *   promotion   1.20 × 10%   = 0.12
   *   pays        1.20 − 0.12  = 1.08
   *   ex-VAT      1.08 ÷ 1.15  = 0.9391304… → 0.94
   *   VAT         1.08 − 0.94  = 0.14
   */
  it("takes a 10% promotion off the shelf price, not off the ex-VAT figure", () => {
    const checkout = calculateRetailCheckout({
      lines: [{ id: "castle", quantity: 1, unitPrice: 1.2, taxPercent: 15, taxInclusive: true }],
      promotion: { id: "promo", type: "PERCENT", value: 10 },
    });

    expectExactly(checkout.promotionDiscountAmount, "0.12", "promotion");
    expectExactly(checkout.lines[0].taxAmount, "0.14", "VAT");
    expectExactly(checkout.total, "1.08", "total");
    expectBalances(checkout);
  });
});
