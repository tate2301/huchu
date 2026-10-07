import { describe, expect, it } from "vitest";

import type { Label } from "./data";
import { A4_PER_PAGE, eachCopy, labelsHtml } from "./render";

/** Shelf labels on paper (PRD-06): a page per strip, 24 cells to an A4 page. */

const label = (name: string, copies = 1, overrides: Partial<Label> = {}): Label => ({
  productId: name,
  name,
  price: "US$0.70",
  was: "US$0.75",
  barcode: "6001586239666",
  symbology: "EAN13",
  copies,
  ...overrides,
});

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("an A4 sheet", () => {
  it("holds 24 cells a page, three across and eight down", () => {
    const html = labelsHtml("A4", [label("Coca-Cola 500ml", 20), label("Charcoal 4kg", 10, { barcode: "CHARCOAL-4KG", symbology: "CODE128" })]);
    const pages = html.split('<section class="sheet">').slice(1);
    expect(A4_PER_PAGE).toBe(24);
    expect(pages.map((page) => count(page, '<div class="label">'))).toEqual([24, 6]);
    expect(html).toContain("@page { size: A4; margin: 0; }");
    expect(html).toContain("grid-template-columns: repeat(3, 70mm); grid-template-rows: repeat(8, 37mm)");
  });
});

describe("a shelf strip", () => {
  it("is 38 × 21 mm with the name, the price, the was price struck through and the barcode as SVG", () => {
    const html = labelsHtml("STRIP", [label("Coca-Cola 500ml")]);
    expect(html).toContain("@page { size: 38mm 21mm; margin: 0; }");
    expect(html).toContain('<div class="name">Coca-Cola 500ml</div>');
    expect(html).toContain('<span class="price">US$0.70</span>');
    expect(html).toContain('<s class="was">US$0.75</s>');
    expect(html).toMatch(/<div class="bars"><svg viewBox="[^"]+" xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
  });

  it("prints a page per copy and leaves out what is off", () => {
    const html = labelsHtml("STRIP", [label("Ice 2kg bag", 2, { was: null, barcode: null, symbology: null })]);
    expect(count(html, '<div class="label">')).toBe(2);
    expect(html).not.toContain("<s ");
    expect(html).not.toContain("<svg");
    expect(eachCopy([label("A", 3), label("B", 1)]).map((each) => each.name)).toEqual(["A", "A", "A", "B"]);
  });

  it("escapes the name", () => {
    expect(labelsHtml("TAG", [label("Gin & <Tonic>")])).toContain("Gin &amp; &lt;Tonic&gt;");
  });
});
