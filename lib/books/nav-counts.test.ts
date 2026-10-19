import { describe, expect, it } from "vitest";

import { booksBadges } from "./nav-counts";

describe("Books' panel counts", () => {
  it("draws a figure beside each row that has one, and none for a zero", () => {
    expect(booksBadges({ invoices: 3, onAccount: 0, bank: 4, takings: 0, needs: 0 })).toEqual({ "/books/invoices": "3", "/books/bank": "4" });
    expect(booksBadges({ invoices: 0, onAccount: 2, bank: 0, takings: 1, needs: 2 })).toEqual({ "/books/payments": "2", "/books/takings": "1", "/books/needs-posting": "2" });
  });
});
