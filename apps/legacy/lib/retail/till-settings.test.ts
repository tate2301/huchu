/**
 * The two decisions on the till's settings screen, asserted.
 *
 * S-7.4. One is a permission decision — may the person at the till change what the
 * till is set to — and one is a money rule: what VAT this shop is actually
 * charging, derived from the shelf rather than typed into a box.
 *
 * Everything is `Prisma.Decimal` and every rate assertion is an exact string.
 * There is no `toBeCloseTo` here: a VAT rate that is approximately right is a
 * receipt ZIMRA does not accept.
 */

import { describe, expect, it } from "vitest";

import { Prisma } from "@corelithzw/db";

import {
  canEditTillSettings,
  summariseShelfTax,
  summariseTillCapabilities,
} from "./till-settings";

const dec = (value: string) => new Prisma.Decimal(value);

/* ─── Who may change the till's settings ──────────────────────────────────── */

describe("a cashier cannot raise their own ceiling", () => {
  /**
   * The whole reason the screen has no write handler. If this ever flips, the
   * discount ceiling has stopped being a control.
   */
  it("refuses a cashier retail.setup", () => {
    expect(canEditTillSettings("CASHIER")).toBe(false);
  });

  it("allows the three manager roles", () => {
    expect(canEditTillSettings("SHOP_MANAGER")).toBe(true);
    expect(canEditTillSettings("MANAGER")).toBe(true);
    expect(canEditTillSettings("SUPERADMIN")).toBe(true);
  });

  it("denies by default — an unknown role, no role, and a stock clerk", () => {
    expect(canEditTillSettings("STOCK_CLERK")).toBe(false);
    expect(canEditTillSettings("TEACHER")).toBe(false);
    expect(canEditTillSettings(null)).toBe(false);
    expect(canEditTillSettings(undefined)).toBe(false);
    expect(canEditTillSettings("")).toBe(false);
  });
});

describe("the capability list a cashier is shown", () => {
  const byId = (role: string) =>
    new Map(summariseTillCapabilities(role).map((row) => [row.id, row]));

  it("grants selling and their own drawer, and nothing else", () => {
    const cashier = byId("CASHIER");
    expect(cashier.get("sell")?.allowed).toBe(true);
    expect(cashier.get("shift")?.allowed).toBe(true);
    expect(cashier.get("refund")?.allowed).toBe(false);
    expect(cashier.get("void")?.allowed).toBe(false);
    expect(cashier.get("price-override")?.allowed).toBe(false);
    expect(cashier.get("cost-price")?.allowed).toBe(false);
    expect(cashier.get("setup")?.allowed).toBe(false);
  });

  it("grants a shop manager all seven", () => {
    for (const row of summariseTillCapabilities("SHOP_MANAGER")) {
      expect(row.allowed).toBe(true);
    }
  });

  /**
   * The three a manager can unblock at the counter carry a way out; the three
   * that are simply not the cashier's say what they are instead. A list of
   * identical refusals is a list nobody reads.
   */
  it("says what to do about the refusals a manager can unblock", () => {
    const cashier = byId("CASHIER");
    expect(cashier.get("refund")?.whenRefused).toContain("manager");
    expect(cashier.get("void")?.whenRefused).toContain("manager");
    expect(cashier.get("price-override")?.whenRefused).toContain("manager");
    expect(cashier.get("cost-price")?.whenRefused).not.toContain("manager");
  });

  it("returns every capability for a role that holds none", () => {
    const rows = summariseTillCapabilities("TEACHER");
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.allowed === false)).toBe(true);
  });
});

/* ─── What the shelf is taxed at ──────────────────────────────────────────── */

/**
 * The bottle store's shelf, as it actually is: 412 lines at the standard 15%,
 * and three zero-rated lines — bottled water, bread and a bag of sugar the shop
 * carries for the flat above.
 */
const BOTTLE_STORE_SHELF = [
  { taxPercent: dec("15.00"), productCount: 412 },
  { taxPercent: dec("0.00"), productCount: 3 },
];

describe("the VAT the shop is actually charging", () => {
  it("is 15.00, not the mean of the shelf", () => {
    const summary = summariseShelfTax(BOTTLE_STORE_SHELF);
    expect(summary.standardRatePercent).toBe("15.00");
    // 412×15 ÷ 415 = 14.8915..., a rate no bottle in the shop is sold at. The
    // mode is the only honest answer and this is the assertion that pins it.
    expect(summary.standardRatePercent).not.toBe("14.89");
  });

  it("reports the shelf as mixed, and lists both rates most-used first", () => {
    const summary = summariseShelfTax(BOTTLE_STORE_SHELF);
    expect(summary.mixed).toBe(true);
    expect(summary.rates).toEqual([
      { taxPercent: "15.00", productCount: 412 },
      { taxPercent: "0.00", productCount: 3 },
    ]);
    expect(summary.productCount).toBe(415);
  });

  it("is not mixed when one rate covers the shelf", () => {
    const summary = summariseShelfTax([{ taxPercent: dec("15.00"), productCount: 412 }]);
    expect(summary.mixed).toBe(false);
    expect(summary.standardRatePercent).toBe("15.00");
  });

  /**
   * `14.5` typed as a number, `"14.50"` off a `Decimal(5,2)` column and
   * `Decimal("14.500")` are one rate. A float comparison would already have
   * merged them; the point is that `Decimal.equals` does too, and that
   * `15` stays separate from `14.5`.
   */
  it("collapses the same rate written three ways, and only that rate", () => {
    const summary = summariseShelfTax([
      { taxPercent: 14.5, productCount: 2 },
      { taxPercent: "14.50", productCount: 3 },
      { taxPercent: dec("14.500"), productCount: 4 },
      { taxPercent: dec("15.00"), productCount: 8 },
    ]);
    // 2 + 3 + 4 = 9 against 8, so the merged rate leads — which is the point:
    // had the three spellings stayed separate, 15.00 would have won on 8.
    expect(summary.rates).toEqual([
      { taxPercent: "14.50", productCount: 9 },
      { taxPercent: "15.00", productCount: 8 },
    ]);
    expect(summary.standardRatePercent).toBe("14.50");
  });

  /**
   * An even split is the one case where "most used" cannot decide. The higher
   * rate leads, because it is the one a customer is more likely to be charged
   * and the one a cashier being asked "is VAT in this price" should hear first.
   */
  it("breaks a tie on the higher rate", () => {
    const summary = summariseShelfTax([
      { taxPercent: dec("0.00"), productCount: 20 },
      { taxPercent: dec("15.00"), productCount: 20 },
    ]);
    expect(summary.standardRatePercent).toBe("15.00");
    expect(summary.rates[0]).toEqual({ taxPercent: "15.00", productCount: 20 });
  });

  /**
   * An empty shelf is not a zero-rated shelf. A screen that printed "VAT 0.00%"
   * at a shop that has not finished loading its products would be telling a
   * cashier something false about every sale they are about to ring.
   */
  it("returns null rather than zero when nothing is priced", () => {
    const summary = summariseShelfTax([]);
    expect(summary.standardRatePercent).toBeNull();
    expect(summary.mixed).toBe(false);
    expect(summary.rates).toEqual([]);
    expect(summary.productCount).toBe(0);
  });

  it("keeps a genuinely zero-rated shelf at 0.00, distinct from empty", () => {
    const summary = summariseShelfTax([{ taxPercent: dec("0.00"), productCount: 6 }]);
    expect(summary.standardRatePercent).toBe("0.00");
    expect(summary.productCount).toBe(6);
  });

  /** 14.5% is the prototype's number and Zimbabwe's until 2022. It is not ours. */
  it("does not invent 14.5 for a shelf that carries 15", () => {
    const summary = summariseShelfTax([{ taxPercent: dec("15"), productCount: 1 }]);
    expect(summary.standardRatePercent).toBe("15.00");
    expect(summary.rates.map((row) => row.taxPercent)).not.toContain("14.50");
  });
});
