import { describe, expect, it } from "vitest";

import { booksBadges, endOfWeek } from "./nav-counts";

const none = { invoices: 0, onAccount: 0, bank: 0, takings: 0, needs: 0, bills: 0, requisitions: 0, claims: 0, fiscal: 0 };

describe("Books' panel counts", () => {
  it("draws a figure beside each row that has one, and none for a zero", () => {
    expect(booksBadges({ ...none, invoices: 3, bank: 4 })).toEqual({ "/books/invoices": "3", "/books/bank": "4" });
    expect(booksBadges({ ...none, onAccount: 2, takings: 1, needs: 2 })).toEqual({ "/books/payments": "2", "/books/takings": "1", "/books/needs-posting": "2" });
  });

  it("counts Bills & spending's rows: bills due this week, requisitions and claims to approve", () => {
    expect(booksBadges({ ...none, bills: 4, requisitions: 2, claims: 1 })).toEqual({ "/books/bills": "4", "/books/requisitions": "2", "/books/claims": "1" });
    expect(booksBadges({ ...none, fiscal: 1 })).toEqual({ "/books/fiscal": "1" });
  });

  it("ends the week on Sunday night, today included when it is Sunday", () => {
    expect(endOfWeek(new Date("2026-10-18T10:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-19");
    expect(endOfWeek(new Date("2026-10-14T10:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-19");
    expect(endOfWeek(new Date("2026-10-19T10:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-26");
  });
});
