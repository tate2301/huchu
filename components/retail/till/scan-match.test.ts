import { describe, expect, it } from "vitest";

import { exactMatch, parseScan, pickScanned, searchShelf } from "./scan-match";

const shelf = [
  { id: "lager", name: "Castle Lager 340ml", sku: "CL340", barcode: "6001108011234" },
  { id: "ice", name: "Ice 2kg", sku: "ICE2", barcode: null },
  { id: "milk", name: "Dairibord milk 1L", sku: "6001108", barcode: "6009801234567" },
];

describe("pickScanned", () => {
  it("takes the product whose barcode the code is, wherever the search ranked it", () => {
    expect(pickScanned(shelf.slice().reverse(), "6001108011234")?.id).toBe("lager");
  });

  it("takes an exact SKU when no barcode matches", () => {
    expect(pickScanned(shelf, "6001108")?.id).toBe("milk");
    expect(pickScanned(shelf, " ice2 ")?.id).toBe("ice");
  });

  it("falls back to the first the search found, and to nothing for nothing", () => {
    expect(pickScanned(shelf, "castle")?.id).toBe("lager");
    expect(pickScanned(shelf, "   ")).toBeNull();
    expect(pickScanned([], "6001108011234")).toBeNull();
  });
});

describe("exactMatch", () => {
  it("answers only for a code that is exactly a barcode or SKU", () => {
    expect(exactMatch(shelf, "6009801234567")?.id).toBe("milk");
    expect(exactMatch(shelf, "cl340")?.id).toBe("lager");
    expect(exactMatch(shelf, "castle")).toBeNull();
  });
});

describe("parseScan", () => {
  it("reads a count typed before the code", () => {
    expect(parseScan("3*6001108011234")).toEqual({ quantity: 3, code: "6001108011234" });
    expect(parseScan(" 12 × ice2 ")).toEqual({ quantity: 12, code: "ice2" });
  });

  it("takes anything else as one of the code", () => {
    expect(parseScan("6001108011234")).toEqual({ quantity: 1, code: "6001108011234" });
    expect(parseScan("12X500")).toEqual({ quantity: 1, code: "12X500" });
    expect(parseScan("0*ice")).toEqual({ quantity: 1, code: "0*ice" });
    expect(parseScan("3*")).toEqual({ quantity: 1, code: "3*" });
  });
});

describe("searchShelf", () => {
  it("finds by name, SKU or barcode, ignoring case", () => {
    expect(searchShelf(shelf, "ICE").map((item) => item.id)).toEqual(["ice"]);
    expect(searchShelf(shelf, "cl34").map((item) => item.id)).toEqual(["lager"]);
    expect(searchShelf(shelf, "600980").map((item) => item.id)).toEqual(["milk"]);
    expect(searchShelf(shelf, "")).toEqual([]);
  });
});
