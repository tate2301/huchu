import { describe, expect, it } from "vitest";

import { basisPoints, byProblem, centsOf, NO_COST_NOTE, previewLines, type PreviewRow } from "./preview";

/** Change many prices' arithmetic (PRD-07, W-15): whole cents, rounded up. */

const castle: PreviewRow = { productId: "castle", name: "Castle Lager 340ml", price: 1.2, cost: 0.86 };
const ice: PreviewRow = { productId: "ice", name: "Ice 2kg bag", price: 1.4, cost: null };

const next = (rows: PreviewRow[], how: "RAISE" | "MARGIN" | "ONE_PRICE", by: string, round: "NO" | "UP_5" | "UP_10") =>
  previewLines(rows, { how, by, round }).map((line) => line.next);

describe("previewLines", () => {
  it("raises 5% on 1.20 to 1.26, then up to the next 5 or 10 cents", () => {
    expect(next([castle], "RAISE", "5%", "NO")).toEqual([1.26]);
    expect(next([castle], "RAISE", "5%", "UP_5")).toEqual([1.3]);
    expect(next([castle], "RAISE", "5%", "UP_10")).toEqual([1.3]);
    // A price already on 5 cents stays there.
    expect(next([castle], "RAISE", "0%", "UP_5")).toEqual([1.2]);
  });

  it("sets a margin of 30% on a cost of 0.86: 1.23, up to 1.25", () => {
    expect(next([castle], "MARGIN", "30%", "NO")).toEqual([1.23]);
    expect(next([castle], "MARGIN", "30", "UP_5")).toEqual([1.25]);
    const [line] = previewLines([castle], { how: "MARGIN", by: "30%", round: "UP_5" });
    expect(line).toMatchObject({ now: 1.2, margin: 28.3, next: 1.25, nextMargin: 31.2, belowCost: false, note: null });
  });

  it("leaves a product with no cost at its price, and says so", () => {
    const [line] = previewLines([ice], { how: "MARGIN", by: "30%", round: "UP_5" });
    expect(line).toMatchObject({ now: 1.4, next: 1.4, margin: null, note: NO_COST_NOTE, belowCost: false });
  });

  it("puts one price on every line, and flags a line it takes under its cost", () => {
    const lines = previewLines([castle, ice], { how: "ONE_PRICE", by: "0.80", round: "NO" });
    expect(lines.map((line) => line.next)).toEqual([0.8, 0.8]);
    expect(lines.map((line) => line.belowCost)).toEqual([true, false]);
  });

  it("works in whole cents, so a cent never drifts", () => {
    // 0.1 + 0.2 in floats is not 0.3; 19.99 × 1.10 is 21.989 → 21.99.
    expect(next([{ ...castle, price: 19.99 }], "RAISE", "10%", "NO")).toEqual([21.99]);
    expect(next([{ ...castle, price: 0.3 }], "RAISE", "-10%", "NO")).toEqual([0.27]);
    expect(centsOf("US$18.99")).toBe(1899);
    expect(centsOf("2.5")).toBe(250);
    expect(basisPoints("2.5%")).toBe(250);
  });

  it("says why a By is refused", () => {
    expect(byProblem("RAISE", "five")).toBe("Write the raise as a percentage, like 5%.");
    expect(byProblem("MARGIN", "100%")).toBe("Write the margin as a percentage under 100, like 30%.");
    expect(byProblem("ONE_PRICE", "abc")).toBe("Write the price as a figure, like 2.10.");
    expect(byProblem("RAISE", "5%")).toBeNull();
  });
});
