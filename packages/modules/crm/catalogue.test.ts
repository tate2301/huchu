import { describe, expect, it } from "vitest";

import { belowCostLines, lineTotals, needsDiscountApproval, quoteTotals } from "./catalogue";
import {
  ageingBucket,
  chaseUrgency,
  daysOverdue,
  orderChaseList,
  summarizeAgeing,
  validateCollectionNote,
} from "./collections";


describe("lineTotals", () => {
  it("charges tax on the discounted amount, not the list price", () => {
    // Charging VAT on money the customer isn't paying turns into a credit
    // note and a phone call.
    const totals = lineTotals({
      description: "Panel",
      quantity: 2,
      unitPrice: 100,
      taxRate: 15,
      discountPercent: 10,
    });
    expect(totals.gross).toBe(200);
    expect(totals.discount).toBe(20);
    expect(totals.net).toBe(180);
    expect(totals.tax).toBe(27);
    expect(totals.total).toBe(207);
  });

  it("reports margin when the cost is known and nothing when it isn't", () => {
    const withCost = lineTotals({
      description: "Panel",
      quantity: 2,
      unitPrice: 100,
      costPrice: 60,
    });
    expect(withCost.margin).toBe(80);

    const withoutCost = lineTotals({ description: "Panel", quantity: 2, unitPrice: 100 });
    expect(withoutCost.margin).toBeNull();
  });

  it("clamps a nonsense discount rather than inverting the line", () => {
    expect(lineTotals({ description: "x", quantity: 1, unitPrice: 100, discountPercent: 150 }).net).toBe(0);
    expect(lineTotals({ description: "x", quantity: 1, unitPrice: 100, discountPercent: -50 }).net).toBe(100);
  });
});

describe("quoteTotals", () => {
  const lines = [
    { description: "Panel", quantity: 2, unitPrice: 100, taxRate: 15, costPrice: 60 },
    { description: "Fitting", quantity: 1, unitPrice: 50, taxRate: 15, costPrice: 20 },
  ];

  it("adds up the lines", () => {
    const totals = quoteTotals(lines);
    expect(totals.subtotal).toBe(250);
    expect(totals.tax).toBe(37.5);
    expect(totals.total).toBe(287.5);
  });

  it("applies a document discount after line discounts and reduces the tax", () => {
    const totals = quoteTotals(lines, 10);
    expect(totals.net).toBe(225);
    expect(totals.discount).toBe(25);
    // Tax follows the money actually being charged.
    expect(totals.tax).toBeCloseTo(33.75, 2);
    expect(totals.total).toBeCloseTo(258.75, 2);
  });

  it("reports margin and margin percent together", () => {
    const totals = quoteTotals(lines);
    expect(totals.margin).toBe(110);
    expect(totals.marginPercent).toBe(44);
  });

  it("says nothing about margin when a line has no cost", () => {
    const totals = quoteTotals([{ description: "x", quantity: 1, unitPrice: 100 }]);
    expect(totals.margin).toBeNull();
    expect(totals.marginPercent).toBeNull();
  });

  it("handles an empty quote without dividing by zero", () => {
    const totals = quoteTotals([]);
    expect(totals.total).toBe(0);
    expect(totals.discountPercent).toBe(0);
    expect(totals.marginPercent).toBeNull();
  });
});

describe("needsDiscountApproval", () => {
  it("trips on an overall discount above the threshold", () => {
    const result = needsDiscountApproval({
      totals: quoteTotals(
        [{ description: "x", quantity: 1, unitPrice: 100, discountPercent: 20 }],
      ),
      companyThresholdPercent: 10,
      lines: [{ discountPercent: 20 }],
    });
    expect(result.required).toBe(true);
    expect(result.reason).toContain("overall discount");
  });

  it("also trips on one line past its own cap, hidden inside a modest total", () => {
    // A 40% discount on one small line barely moves the overall percentage,
    // which is exactly why the per-item cap exists.
    const lines = [
      { description: "Big", quantity: 1, unitPrice: 10_000 },
      { description: "Small", quantity: 1, unitPrice: 100, discountPercent: 40 },
    ];
    const result = needsDiscountApproval({
      totals: quoteTotals(lines),
      companyThresholdPercent: 10,
      lines: [{}, { discountPercent: 40, maxDiscountPercent: 5 }],
    });
    expect(result.required).toBe(true);
    expect(result.reason).toContain("above the 5% allowed");
  });

  it("lets a normal quote through", () => {
    const result = needsDiscountApproval({
      totals: quoteTotals([{ description: "x", quantity: 1, unitPrice: 100, discountPercent: 5 }]),
      companyThresholdPercent: 10,
      lines: [{ discountPercent: 5, maxDiscountPercent: 20 }],
    });
    expect(result.required).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("ignores an item with no cap of its own", () => {
    const result = needsDiscountApproval({
      totals: quoteTotals([{ description: "x", quantity: 1, unitPrice: 100 }]),
      companyThresholdPercent: 10,
      lines: [{ discountPercent: 90, maxDiscountPercent: null }],
    });
    expect(result.required).toBe(false);
  });
});

describe("belowCostLines", () => {
  it("names the lines being sold at a loss", () => {
    const flagged = belowCostLines([
      { description: "ok", quantity: 1, unitPrice: 100, costPrice: 60 },
      { description: "loss", quantity: 1, unitPrice: 100, discountPercent: 50, costPrice: 60 },
      { description: "unknown", quantity: 1, unitPrice: 10 },
    ]);
    expect(flagged).toEqual([1]);
  });
});


describe("ageing", () => {
  const now = new Date("2026-03-31T12:00:00Z");

  it("puts nothing not yet due into an overdue bucket", () => {
    expect(ageingBucket("2026-04-15", now)).toBe("CURRENT");
    expect(daysOverdue("2026-04-15", now)).toBe(0);
  });

  it("bands by how late it is", () => {
    expect(ageingBucket("2026-03-20", now)).toBe("D1_30");
    expect(ageingBucket("2026-02-15", now)).toBe("D31_60");
    expect(ageingBucket("2026-01-15", now)).toBe("D61_90");
    expect(ageingBucket("2025-10-01", now)).toBe("D90_PLUS");
  });

  it("treats a missing due date as not overdue rather than ancient", () => {
    expect(ageingBucket(null, now)).toBe("CURRENT");
  });
});

describe("summarizeAgeing", () => {
  const now = new Date("2026-03-31T12:00:00Z");

  it("totals each band and always returns all of them", () => {
    const summary = summarizeAgeing(
      [
        { outstanding: 100, dueDate: "2026-03-20" },
        { outstanding: 250, dueDate: "2026-03-25" },
        { outstanding: 900, dueDate: "2025-10-01" },
      ],
      now,
    );
    expect(summary).toHaveLength(5);
    expect(summary.find((row) => row.bucket === "D1_30")).toMatchObject({ count: 2, amount: 350 });
    expect(summary.find((row) => row.bucket === "D90_PLUS")).toMatchObject({ count: 1, amount: 900 });
  });

  it("ignores anything already settled", () => {
    const summary = summarizeAgeing([{ outstanding: 0, dueDate: "2020-01-01" }], now);
    expect(summary.every((row) => row.count === 0)).toBe(true);
  });
});

describe("chaseUrgency", () => {
  const now = new Date("2026-03-31T12:00:00Z");

  it("is zero for something not yet due", () => {
    expect(chaseUrgency({ outstanding: 5000, dueDate: "2026-04-30" }, now)).toBe(0);
  });

  it("rises with age and with size", () => {
    const small = chaseUrgency({ outstanding: 100, dueDate: "2026-03-20" }, now);
    const large = chaseUrgency({ outstanding: 50_000, dueDate: "2026-03-20" }, now);
    const older = chaseUrgency({ outstanding: 100, dueDate: "2026-01-20" }, now);
    expect(large).toBeGreaterThan(small);
    expect(older).toBeGreaterThan(small);
  });

  it("pushes a broken promise to the top", () => {
    const silent = chaseUrgency({ outstanding: 1000, dueDate: "2026-03-20" }, now);
    const broken = chaseUrgency(
      { outstanding: 1000, dueDate: "2026-03-20", promisedAt: "2026-03-28" },
      now,
    );
    expect(broken).toBeGreaterThan(silent);
  });

  it("leaves a live promise alone until the day comes", () => {
    const silent = chaseUrgency({ outstanding: 1000, dueDate: "2026-03-20" }, now);
    const promised = chaseUrgency(
      { outstanding: 1000, dueDate: "2026-03-20", promisedAt: "2026-04-05" },
      now,
    );
    expect(promised).toBeLessThan(silent);
  });

  it("stays inside 0 and 100", () => {
    const extreme = chaseUrgency(
      { outstanding: 1_000_000, dueDate: "2020-01-01", promisedAt: "2020-02-01" },
      now,
    );
    expect(extreme).toBeLessThanOrEqual(100);
    expect(extreme).toBeGreaterThanOrEqual(0);
  });
});

describe("orderChaseList", () => {
  const now = new Date("2026-03-31T12:00:00Z");

  it("puts the broken promise before the quiet one, and the live one last", () => {
    const ordered = orderChaseList(
      [
        { outstanding: 1000, dueDate: "2026-03-20", promisedAt: "2026-04-10" },
        { outstanding: 1000, dueDate: "2026-03-20" },
        { outstanding: 1000, dueDate: "2026-03-20", promisedAt: "2026-03-25" },
      ],
      now,
    );
    expect(ordered[0].promisedAt).toBe("2026-03-25");
    expect(ordered[2].promisedAt).toBe("2026-04-10");
  });
});

describe("validateCollectionNote", () => {
  it("insists a promise has a date", () => {
    expect(validateCollectionNote({ outcome: "PROMISED_TO_PAY" })).toContain("needs a date");
    expect(
      validateCollectionNote({ outcome: "PROMISED_TO_PAY", promisedAt: "2026-04-01T00:00:00Z" }),
    ).toBeNull();
  });

  it("asks nothing of the other outcomes", () => {
    expect(validateCollectionNote({ outcome: "NO_ANSWER" })).toBeNull();
  });
});
