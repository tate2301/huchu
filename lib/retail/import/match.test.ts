import { describe, expect, it } from "vitest";

import { catalogIndex, matchRow } from "./match";

/** "By barcode first, then by name" (SET-11). */

const index = catalogIndex([
  { id: "coke", name: "Coca-Cola 2l", barcode: "5449000000996" },
  { id: "castle", name: "Castle Lager 340ml", barcode: "6001108000011" },
  { id: "zambezi", name: "Zambezi Lager 375ml", barcode: null },
]);

describe("matchRow", () => {
  it("takes the barcode before the name", () => {
    expect(matchRow({ name: "Zambezi Lager 375ml", barcode: "6001108 000011" }, index)).toMatchObject({ kind: "UPDATE", product: { id: "castle" } });
  });

  it("then the exact name, trimmed and in any case", () => {
    expect(matchRow({ name: "  zambezi LAGER 375ml ", barcode: "60099999" }, index)).toMatchObject({ kind: "UPDATE", product: { id: "zambezi" } });
  });

  it("a name equal without case, spaces and punctuation only looks like it", () => {
    expect(matchRow({ name: "Coca Cola 2l", barcode: null }, index)).toMatchObject({ kind: "LOOKS_LIKE", product: { id: "coke" } });
    expect(matchRow({ name: "cocacola 2L", barcode: null }, index)).toMatchObject({ kind: "LOOKS_LIKE", product: { id: "coke" } });
  });

  it("anything else is new", () => {
    expect(matchRow({ name: "Coca-Cola 1l", barcode: "60011111" }, index)).toEqual({ kind: "NEW" });
    expect(matchRow({ name: null, barcode: null }, index)).toEqual({ kind: "NEW" });
  });
});
