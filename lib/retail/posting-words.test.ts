import { describe, expect, it } from "vitest";

import {
  lastPostedWords,
  parseQuickAccount,
  postedToast,
  runParts,
  scheduleOf,
  typeWithArticle,
  wrongTypeProblem,
} from "./posting-words";

describe("a quick-added account", () => {
  it("reads the code from the leading digits and the rest as the name", () => {
    expect(parseQuickAccount("1012 Cash on hand, rand", "Asset")).toEqual({
      ok: true,
      code: "1012",
      name: "Cash on hand, rand",
      type: "ASSET",
    });
    expect(parseQuickAccount("  4210 - Bottle returns ", "income")).toEqual({
      ok: true,
      code: "4210",
      name: "Bottle returns",
      type: "INCOME",
    });
  });

  it("says what is wrong with each field", () => {
    expect(parseQuickAccount("Cash on hand", "Money")).toEqual({
      ok: false,
      fieldErrors: {
        codeAndName: "Start with the account’s code, then its name: 1012 Cash on hand, rand.",
        type: "Asset, liability, income or expense.",
      },
    });
    expect(parseQuickAccount("", "Liability")).toEqual({
      ok: false,
      fieldErrors: { codeAndName: "Type the account’s code and name, like 1012 Cash on hand, rand." },
    });
    // Equity is not a type a till posts to.
    expect(parseQuickAccount("3100 Drawings", "Equity").ok).toBe(false);
  });
});

describe("an account of the wrong type", () => {
  it("names the account, its type and what the field needs", () => {
    expect(typeWithArticle("ASSET")).toBe("an asset");
    expect(typeWithArticle("LIABILITY")).toBe("a liability");
    expect(wrongTypeProblem({ code: "1012", name: "Cash on hand, rand", type: "ASSET" }, "Sales", ["INCOME"])).toBe(
      "1012 Cash on hand, rand is an asset account. Sales needs an income account.",
    );
    expect(wrongTypeProblem({ code: "4000", name: "Sales", type: "INCOME" }, "Vouchers", ["ASSET", "LIABILITY"])).toBe(
      "4000 Sales is an income account. Vouchers needs an asset or a liability account.",
    );
  });
});

describe("Last posted", () => {
  const now = new Date("2026-10-03T08:00:00+02:00");

  it("reads the run's day and time and what it posted, dropping the parts with nothing", () => {
    expect(
      lastPostedWords({ at: "2026-10-02T23:00:00+02:00", sales: 412, refunds: 0, deliveries: 6, counts: 1, failed: 0 }, now),
    ).toBe("2 October, 23:00. 412 sales, 6 deliveries, 1 count.");
    expect(
      lastPostedWords({ at: "2026-10-03T07:41:00+02:00", sales: 1, refunds: 0, deliveries: 0, counts: 0, failed: 0 }, now),
    ).toBe("3 October, 07:41. 1 sale.");
  });

  it("says when nothing was waiting, what could not post, and a run from another year", () => {
    expect(lastPostedWords({ at: "2025-12-31T23:00:00+02:00", sales: 0, refunds: 0, deliveries: 0, counts: 0, failed: 2 }, now)).toBe(
      "31 December 2025, 23:00. Nothing was waiting. 2 items could not post.",
    );
    expect(lastPostedWords(null, now)).toBe("Not yet.");
  });

  it("names what else posted when no sale, refund, delivery or count did", () => {
    expect(
      lastPostedWords({ at: "2026-10-02T23:00:00+02:00", sales: 0, refunds: 0, deliveries: 0, counts: 0, other: 2, failed: 0 }, now),
    ).toBe("2 October, 23:00. 2 other entries.");
  });

  it("counts refunds, deliveries and counts in the singular and plural", () => {
    expect(runParts({ sales: 2, refunds: 1, deliveries: 1, counts: 2 })).toBe("2 sales, 1 refund, 1 delivery, 2 counts");
  });
});

describe("the toast after Post now", () => {
  it("says what posted, or that nothing was waiting", () => {
    expect(postedToast({ sales: 1, refunds: 0, deliveries: 0, counts: 0, other: 0, failed: 0 })).toBe("Posted 1 sale.");
    expect(postedToast({ sales: 0, refunds: 0, deliveries: 0, counts: 0, other: 0, failed: 0 })).toBe("Nothing was waiting to post.");
    expect(postedToast({ sales: 0, refunds: 0, deliveries: 0, counts: 0, other: 2, failed: 1 })).toBe("Posted. 1 item could not post.");
  });
});

describe("the schedule", () => {
  it("reads the segment's words back", () => {
    expect(scheduleOf("At the end of each day")).toBe("END_OF_DAY");
    expect(scheduleOf("With every sale")).toBe("EVERY_SALE");
    expect(scheduleOf("Weekly")).toBeNull();
  });
});
