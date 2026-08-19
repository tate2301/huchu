/**
 * The till's activity timeline, worked by hand.
 *
 * S-7.6. This is a derived view over `RetailSale`, `RetailCashMovement` and
 * `RetailShift`, not the chained trail R-3.3 added beside it. What it asserts is
 * that the derivation cannot lie about money or about who did what.
 *
 * Two traps have their own describes, because both are ways the prototype's
 * `logAudit` would be wrong if it were ported literally:
 *
 *  1. It negates reversals at the call site — `logAudit('void', …, -sel.total)` —
 *     and our `VOID` and `REFUND` rows are already stored negative.
 *  2. It has one "Discounts" chip, and `RetailSale.overrideReason` carries a
 *     manager's price approval on a `SALE` and the reason for the reversal on a
 *     `REFUND` or a `VOID`. Reading it the same way in both places invents a price
 *     override on every refund the shop has ever given.
 *
 * Exact `Decimal` strings throughout; no `toBeCloseTo`.
 */

import { describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

import {
  TILL_ACTIVITY_KINDS,
  buildTillActivity,
  countTillActivity,
  filterTillActivity,
  movementActivityEntry,
  saleActivityEntries,
  shiftActivityEntries,
  type TillActivityMovementRow,
  type TillActivitySaleRow,
  type TillActivityShiftRow,
} from "./till-activity";

const dec = (value: string) => new Prisma.Decimal(value);

/* ─── Faith's Friday, the same one `cash-up.test.ts` works ────────────────── */

const SHIFT: TillActivityShiftRow = {
  id: "shift-1",
  shiftNo: "S-2841",
  registerName: "Till 02",
  cashierName: "Faith Moyo",
  openingFloat: dec("150.00"),
  countedCash: dec("1356.75"),
  variance: dec("0.00"),
  openedAt: new Date("2026-08-14T05:30:00.000Z"),
  closedAt: new Date("2026-08-14T17:00:00.000Z"),
};

const SALE: TillActivitySaleRow = {
  id: "sale-1",
  saleNo: "HS-01044",
  saleType: "SALE",
  baseAmount: dec("46.00"),
  currency: "USD",
  totalAmount: dec("46.00"),
  cashierName: "Faith Moyo",
  customerName: "Walk-in",
  overrideReason: null,
  postedAt: new Date("2026-08-14T09:12:00.000Z"),
  createdAt: new Date("2026-08-14T09:11:55.000Z"),
  shiftNo: "S-2841",
};

/** Two crates back at 17:45. `_services.ts` stores the amounts negated. */
const REFUND: TillActivitySaleRow = {
  ...SALE,
  id: "sale-2",
  saleNo: "HS-R-0031",
  saleType: "REFUND",
  baseAmount: dec("-47.60"),
  totalAmount: dec("-47.60"),
  overrideReason: "Crates returned unopened",
  postedAt: new Date("2026-08-14T15:45:00.000Z"),
  createdAt: new Date("2026-08-14T15:45:00.000Z"),
};

const VOID: TillActivitySaleRow = {
  ...SALE,
  id: "sale-3",
  saleNo: "HS-V-0009",
  saleType: "VOID",
  baseAmount: dec("-46.00"),
  totalAmount: dec("-46.00"),
  overrideReason: "Rung on the wrong customer",
  postedAt: new Date("2026-08-14T09:20:00.000Z"),
  createdAt: new Date("2026-08-14T09:20:00.000Z"),
};

/** The manager banks $200 at 16:10. */
const DROP: TillActivityMovementRow = {
  id: "move-1",
  type: "DROP_TO_SAFE",
  baseAmount: dec("200.00"),
  reasonCode: "BANK_DEPOSIT",
  reason: "Deposit slip 44119",
  recordedByName: "Tendai Chikafu",
  createdAt: new Date("2026-08-14T14:10:00.000Z"),
  shiftNo: "S-2841",
};

const TOP_UP: TillActivityMovementRow = {
  ...DROP,
  id: "move-2",
  type: "FLOAT_TOP_UP",
  baseAmount: dec("40.00"),
  reasonCode: "CHANGE_REQUIRED",
  reason: null,
  createdAt: new Date("2026-08-14T11:00:00.000Z"),
};

/* ─── Signs ───────────────────────────────────────────────────────────────── */

describe("a reversal is already negative and is not negated again", () => {
  it("shows a $47.60 refund as −47.60, not +47.60", () => {
    const [entry] = saleActivityEntries(REFUND);
    expect(entry.amount).toBe("-47.60");
    expect(entry.kind).toBe("refund");
  });

  it("shows a $46.00 void as −46.00", () => {
    const [entry] = saleActivityEntries(VOID);
    expect(entry.amount).toBe("-46.00");
    expect(entry.kind).toBe("void");
  });

  it("leaves an ordinary sale positive", () => {
    const [entry] = saleActivityEntries(SALE);
    expect(entry.amount).toBe("46.00");
    expect(entry.kind).toBe("sale");
  });

  /** A drop leaves the drawer, a pickup enters it. The type carries the sign. */
  it("signs a drop out and a top-up in", () => {
    expect(movementActivityEntry(DROP).amount).toBe("-200.00");
    expect(movementActivityEntry(TOP_UP).amount).toBe("40.00");
  });

  /**
   * `RetailCashMovement.amount` is documented as always positive and the
   * direction is the type's job. A row that arrived negative anyway must not
   * flip a drop into a deposit.
   */
  it("does not let a wrongly-signed row invert a drop", () => {
    expect(movementActivityEntry({ ...DROP, baseAmount: dec("-200.00") }).amount).toBe(
      "-200.00",
    );
  });
});

/* ─── overrideReason means two different things ───────────────────────────── */

describe("overrideReason is a price approval on a sale and a reason on a reversal", () => {
  it("raises a separate override line for a manager-approved price", () => {
    const entries = saleActivityEntries({
      ...SALE,
      overrideReason: "Manager approved $2.00 off — damaged label",
    });
    expect(entries).toHaveLength(2);
    expect(entries[1].kind).toBe("override");
    expect(entries[1].title).toBe("Price override on HS-01044");
    expect(entries[1].detail).toBe("Manager approved $2.00 off — damaged label");
    // The sale's total is not the size of the discount and must not be shown
    // beside a line labelled "override".
    expect(entries[1].amount).toBeNull();
  });

  it("raises no override line for a refund, and reads the column as the reason", () => {
    const entries = saleActivityEntries(REFUND);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("refund");
    expect(entries[0].detail).toContain("Crates returned unopened");
  });

  it("raises no override line for a void either", () => {
    const entries = saleActivityEntries(VOID);
    expect(entries).toHaveLength(1);
    expect(entries.some((entry) => entry.kind === "override")).toBe(false);
  });

  it("treats a whitespace-only override as absent", () => {
    expect(saleActivityEntries({ ...SALE, overrideReason: "   " })).toHaveLength(1);
  });
});

/* ─── Shift boundaries ────────────────────────────────────────────────────── */

describe("a shift is two events, and the close says whether the drawer agreed", () => {
  it("opens with the float and closes with the count", () => {
    const [open, close] = shiftActivityEntries(SHIFT);
    expect(open.title).toBe("Till opened · S-2841");
    expect(open.amount).toBe("150.00");
    expect(close.title).toBe("Till closed · S-2841");
    expect(close.amount).toBe("1356.75");
    expect(close.detail).toContain("drawer agreed");
  });

  it("names a shortfall as short, and by how much", () => {
    const [, close] = shiftActivityEntries({
      ...SHIFT,
      countedCash: dec("1156.75"),
      variance: dec("-200.00"),
    });
    expect(close.detail).toBe("Till 02 · drawer short 200.00");
  });

  it("names an overage as over", () => {
    const [, close] = shiftActivityEntries({
      ...SHIFT,
      countedCash: dec("1361.75"),
      variance: dec("5.00"),
    });
    expect(close.detail).toBe("Till 02 · drawer over 5.00");
  });

  /** An open drawer has no close. Inventing one would report a shift that ended. */
  it("emits only the open event for a drawer still open", () => {
    const entries = shiftActivityEntries({
      ...SHIFT,
      countedCash: null,
      variance: null,
      closedAt: null,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Till opened · S-2841");
  });
});

/* ─── The timeline ────────────────────────────────────────────────────────── */

describe("the timeline as a whole", () => {
  const entries = buildTillActivity({
    sales: [SALE, REFUND, VOID],
    movements: [DROP, TOP_UP],
    shifts: [SHIFT],
  });

  it("is newest first", () => {
    expect(entries.map((entry) => entry.at)).toEqual([
      "2026-08-14T17:00:00.000Z", // till closed
      "2026-08-14T15:45:00.000Z", // refund
      "2026-08-14T14:10:00.000Z", // drop
      "2026-08-14T11:00:00.000Z", // top-up
      "2026-08-14T09:20:00.000Z", // void
      "2026-08-14T09:12:00.000Z", // sale
      "2026-08-14T05:30:00.000Z", // till opened
    ]);
  });

  /**
   * A sale and the override that approved it share `postedAt` to the
   * millisecond. Without a tie-break the two would swap places between
   * refetches and the screen would twitch under a cashier's hand.
   */
  it("orders same-instant events deterministically", () => {
    const overridden = { ...SALE, overrideReason: "Manager approved $2.00 off" };
    const once = buildTillActivity({ sales: [overridden], movements: [], shifts: [] });
    const again = buildTillActivity({ sales: [overridden], movements: [], shifts: [] });
    expect(once.map((entry) => entry.id)).toEqual(again.map((entry) => entry.id));
    expect(once.map((entry) => entry.id)).toEqual(["override:sale-1", "sale:sale-1"]);
  });

  it("dates a sale by postedAt, falling back to createdAt when it never posted", () => {
    const [posted] = saleActivityEntries(SALE);
    expect(posted.at).toBe("2026-08-14T09:12:00.000Z");
    const [unposted] = saleActivityEntries({ ...SALE, postedAt: null });
    expect(unposted.at).toBe("2026-08-14T09:11:55.000Z");
  });

  it("counts every kind, including the ones with nothing in them", () => {
    const counts = countTillActivity(entries);
    expect(counts).toEqual({
      sale: 1,
      refund: 1,
      void: 1,
      override: 0,
      cash: 2,
      shift: 2,
    });
    expect(Object.keys(counts).sort()).toEqual([...TILL_ACTIVITY_KINDS].sort());
  });

  it("filters to one kind, and 'all' is everything", () => {
    expect(filterTillActivity(entries, "cash").map((entry) => entry.id)).toEqual([
      "cash:move-1",
      "cash:move-2",
    ]);
    expect(filterTillActivity(entries, "all")).toHaveLength(entries.length);
  });

  it("names the actor on every entry", () => {
    expect(entries.every((entry) => Boolean(entry.actor))).toBe(true);
    expect(
      entries.find((entry) => entry.id === "cash:move-1")?.actor,
    ).toBe("Tendai Chikafu");
  });

  it("says nothing at all when the till has done nothing", () => {
    expect(buildTillActivity({ sales: [], movements: [], shifts: [] })).toEqual([]);
  });
});

/* ─── Two currencies over one counter ─────────────────────────────────────── */

describe("a ZWG sale in a USD shop", () => {
  /** $46.00 taken as 1,265.00 ZWG at 27.5. The base figure is what is summed. */
  const zwgSale: TillActivitySaleRow = {
    ...SALE,
    currency: "ZWG",
    totalAmount: dec("1265.00"),
    baseAmount: dec("46.00"),
  };

  it("shows the base amount and notes the tendered currency", () => {
    const [entry] = saleActivityEntries(zwgSale);
    expect(entry.amount).toBe("46.00");
    expect(entry.detail).toContain("ZWG 1265.00");
  });

  it("says nothing about currency when the two agree", () => {
    const [entry] = saleActivityEntries(SALE);
    expect(entry.detail).toBe("Walk-in");
  });
});
