/**
 * Reading a file for the knowledge base: a spreadsheet's prices found by its
 * header row, amounts read however they are written, prose in passages, and a
 * file with no words refused with what to do instead.
 */
import { describe, expect, it } from "vitest";

import { KnowledgeRefused, passages, pricesFromSheets, readAmount, readKnowledgeFile } from "./read";

describe("reading the knowledge base's files", () => {
  it("reads amounts however a price list writes them", () => {
    expect(readAmount("$1,240.50")).toEqual({ value: 1240.5, currency: "USD" });
    expect(readAmount("USD 62")).toEqual({ value: 62, currency: "USD" });
    expect(readAmount("62.00/m²")).toEqual({ value: 62, currency: null });
    expect(readAmount("ZWG 1 200")).toEqual({ value: 1200, currency: "ZWG" });
    expect(readAmount("on request")).toBeNull();
  });

  it("finds a sheet's prices by its header row, below a title, with the unit, code and currency", () => {
    const { prices, text } = pricesFromSheets([
      {
        name: "Rates",
        rows: [
          ["Floorcode rate card 2026", "", "", ""],
          ["Code", "Item", "Unit", "Price (USD)"],
          ["VS-01", "Vinyl sheet, supply and fit", "m²", "62"],
          ["SCR-02", "Self-levelling screed", "m²", "18.50"],
          ["", "Call-out fee", "visit", "on request"],
        ],
      },
    ]);
    expect(prices).toEqual([
      { name: "Vinyl sheet, supply and fit", description: null, code: "VS-01", unit: "m²", unitPrice: 62, currency: "USD", source: "row 3: VS-01 | Vinyl sheet, supply and fit | m² | 62" },
      { name: "Self-levelling screed", description: null, code: "SCR-02", unit: "m²", unitPrice: 18.5, currency: "USD", source: "row 4: SCR-02 | Self-levelling screed | m² | 18.50" },
    ]);
    expect(text).toContain("Call-out fee | visit | on request");
  });

  it("keeps a sheet with no price column as words only", () => {
    const { prices, text } = pricesFromSheets([{ name: "Notes", rows: [["Terms"], ["50% deposit before we start"]] }]);
    expect(prices).toEqual([]);
    expect(text).toContain("50% deposit");
  });

  it("reads a CSV price list and a text file", async () => {
    const csv = await readKnowledgeFile(Buffer.from("Description,Rate\nCarpet tiles laid,24.00\nUnderlay,6.50\n"), "rates.csv");
    expect(csv.kind).toBe("PRICE_LIST");
    expect(csv.prices.map((price) => [price.name, price.unitPrice])).toEqual([
      ["Carpet tiles laid", 24],
      ["Underlay", 6.5],
    ]);
    const words = await readKnowledgeFile(Buffer.from("Our terms\n\nA 50% deposit is due before work starts. Quotes hold for 30 days."), "terms.txt");
    expect(words).toMatchObject({ kind: "DOCUMENT", prices: [], pages: null });
  });

  it("refuses a file it cannot read, saying what to do", async () => {
    await expect(readKnowledgeFile(Buffer.from("x"), "photo.png")).rejects.toThrow("Upload a PDF");
    await expect(readKnowledgeFile(Buffer.from("   "), "empty.txt")).rejects.toBeInstanceOf(KnowledgeRefused);
  });

  it("cuts prose into passages of a few paragraphs", () => {
    const text = Array.from({ length: 10 }, (_, index) => `Paragraph ${index} `.repeat(30)).join("\n\n");
    const cut = passages(text, 1200);
    expect(cut.length).toBeGreaterThan(3);
    expect(cut.every((passage) => passage.length <= 1200)).toBe(true);
    expect(cut.join(" ")).toContain("Paragraph 9");
  });
});
