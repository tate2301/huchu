/** What an invoice's page says changed since the quote it came from. */
import { describe, expect, it } from "vitest";

import { changesFromQuote } from "./invoice-record";

const quote = [
  { description: "Vinyl sheet, 3 consulting rooms", quantity: 58.4, unitPrice: 62 },
  { description: "Coved skirting", quantity: 60, unitPrice: 9.5 },
  { description: "Levelling compound", quantity: 6, unitPrice: 31.5 },
];

describe("what changed since the quote", () => {
  it("is nothing when the lines are as accepted", () => {
    expect(changesFromQuote(quote, quote, "USD")).toEqual([]);
  });

  it("names each line whose quantity or price moved, and lines added or left out", () => {
    const invoice = [
      { description: "Vinyl sheet, 3 consulting rooms", quantity: 58.4, unitPrice: 62 },
      { description: "coved skirting", quantity: 64, unitPrice: 9.75 },
      { description: "Door bars", quantity: 3, unitPrice: 12 },
    ];
    expect(changesFromQuote(invoice, quote, "USD")).toEqual([
      "coved skirting: 64, not 60",
      "coved skirting: $9.75, not $9.50",
      "Door bars: added",
      "Levelling compound: left out",
    ]);
  });
});
