import { describe, expect, it } from "vitest";

import { emptiesRows, emptiesWords, spreadEmpties, type EmptiesLine } from "./empties-words";
import { depositRowLabel, receiptFigure, receiptStamp } from "./receipt-parts";

const line = (patch: Partial<EmptiesLine> & { catalogItemId: string }): EmptiesLine => ({
  name: "Castle Lager, 340ml",
  quantity: 6,
  depositAmount: 0.1,
  depositName: null,
  ...patch,
});

describe("emptiesRows", () => {
  it("puts lines of one named deposit on one row, and counts what they sell", () => {
    const rows = emptiesRows([
      line({ catalogItemId: "castle", depositName: "Bottles, 340 to 375ml" }),
      line({ catalogItemId: "zambezi", name: "Zambezi Lager, 375ml", quantity: 4, depositName: "Bottles, 340 to 375ml" }),
      line({ catalogItemId: "crate", name: "Castle Lager, crate of 24", quantity: 1, depositAmount: 3.4, depositName: "Crates of 24" }),
    ]);
    expect(rows.map((row) => [row.label, row.each, row.most, row.lines.length])).toEqual([
      ["Bottles, 340 to 375ml", 0.1, 10, 2],
      ["Crates of 24", 3.4, 1, 1],
    ]);
  });

  it("keeps a line's product name when its deposit has no name", () => {
    const rows = emptiesRows([line({ catalogItemId: "castle" }), line({ catalogItemId: "lion", name: "Lion Lager, 340ml" })]);
    expect(rows.map((row) => row.label)).toEqual(["Castle Lager", "Lion Lager"]);
  });

  it("keeps one name at two values apart", () => {
    const rows = emptiesRows([
      line({ catalogItemId: "a", depositName: "Bottles" }),
      line({ catalogItemId: "b", depositAmount: 0.2, depositName: "Bottles" }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe("spreadEmpties", () => {
  it("fills the first line, then the next, never past what a line sells", () => {
    const [row] = emptiesRows([
      line({ catalogItemId: "castle", quantity: 6, depositName: "Bottles" }),
      line({ catalogItemId: "zambezi", quantity: 4, depositName: "Bottles" }),
    ]);
    expect(spreadEmpties(row!, 8)).toEqual([
      ["castle", 6],
      ["zambezi", 2],
    ]);
    expect(spreadEmpties(row!, 0)).toEqual([
      ["castle", 0],
      ["zambezi", 0],
    ]);
  });
});

describe("emptiesWords", () => {
  it("says whose ledger the bottles went on", () => {
    expect(emptiesWords(12, [{ supplierId: "d", supplierName: "Delta", quantity: 12 }])).toBe("12 bottles on the ledger for Delta");
  });

  it("names every supplier, and counts bottles with none", () => {
    expect(
      emptiesWords(19, [
        { supplierId: "d", supplierName: "Delta", quantity: 12 },
        { supplierId: "s", supplierName: "Schweppes", quantity: 4 },
      ]),
    ).toBe("12 bottles on the ledger for Delta and 4 for Schweppes, 3 with no supplier");
  });

  it("counts the bottles when none went on a ledger", () => {
    expect(emptiesWords(1, [])).toBe("1 bottle");
    expect(emptiesWords(5, undefined)).toBe("5 bottles");
  });
});

describe("receipt parts", () => {
  it("counts the bottles a line's deposit is for", () => {
    expect(depositRowLabel(0.6, 0.1)).toBe("Deposit, 6 bottles");
    expect(depositRowLabel(-0.1, 0.1)).toBe("Deposit, 1 bottle");
    expect(depositRowLabel(0.6, null)).toBe("Deposit");
  });

  it("prints a figure without the currency, and the date on Harare's clock", () => {
    expect(receiptFigure(7.2)).toBe("7.20");
    expect(receiptFigure(-1.2)).toBe("−1.20");
    expect(receiptStamp("2026-10-02T17:42:00Z")).toBe("Fri 2 Oct 19:42");
  });
});
