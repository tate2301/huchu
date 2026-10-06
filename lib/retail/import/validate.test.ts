import { describe, expect, it } from "vitest";

import { catalogIndex } from "./match";
import { checkRows, type CheckContext } from "./validate";
import { problemView } from "./words";

/** What each row needs fixed, in the order shown, and what it will do (SET-11). */

const ctx: CheckContext = {
  categories: new Set(["soft drinks", "wine", "ciders and coolers", "spirits", "spirits · liqueur"]),
  catalog: catalogIndex([
    { id: "coke", name: "Coca-Cola 2l", barcode: "5449000000996" },
    { id: "castle", name: "Castle Lager 340ml", barcode: "6001108000011" },
  ]),
};

type Fields = Partial<{ name: string; category: string; price: string; barcode: string; cost: string; openingStock: string; packSize: string }>;

const row = (rowNo: number, fields: Fields) => ({
  rowNo,
  name: fields.name ?? null,
  category: fields.category ?? null,
  price: fields.price ?? null,
  barcode: fields.barcode ?? null,
  cost: fields.cost ?? null,
  openingStock: fields.openingStock ?? null,
  packSize: fields.packSize ?? null,
});

const first = (fields: Parameters<typeof row>[1]) => {
  const [checked] = checkRows([row(2, fields)], ctx);
  return problemView(checked!.problems, checked!.args)?.text ?? null;
};

describe("checkRows", () => {
  it("names every problem, the first one shown", () => {
    expect(first({ price: "2.10" })).toBe("No name");
    expect(first({ name: "Hunters Gold" })).toBe("No price");
    expect(first({ name: "Hunters Gold", price: "0.00" })).toBe("No price");
    expect(first({ name: "Nederburg Cabernet", price: "12,60" })).toBe("Price has a comma");
    expect(first({ name: "Nederburg Cabernet", price: "US$12.60" })).toBe("Price is not a number");
    expect(first({ name: "Savanna Dry 330ml", price: "2.10", category: "Ciders" })).toBe("Category “Ciders” is new");
    expect(first({ name: "Mazoe Orange 2l", price: "4.20", barcode: "60016A9" })).toBe("Barcode has letters");
    expect(first({ name: "Mazoe Orange 2l", price: "4.20", barcode: "600169" })).toBe("Barcode is too short");
    expect(first({ name: "Mazoe Orange 2l", price: "4.20", barcode: "600169000000000" })).toBe("Barcode is too long");
    expect(first({ name: "Coca Cola 2l", price: "2.50" })).toBe("Looks like Coca-Cola 2l, already in Products");
    expect(first({ name: "Mazoe Orange 2l", price: "4.20", category: "soft DRINKS", barcode: "6001 6900 0001" })).toBeNull();
  });

  it("keeps every problem a row has, in order, and points the first at its cell", () => {
    const [checked] = checkRows([row(9, { category: "Ice", price: "1,5", barcode: "12" })], ctx);
    expect(checked!.problems).toEqual(["NO_NAME", "PRICE_COMMA", "NEW_CATEGORY", "BARCODE_SHORT"]);
    expect(problemView(checked!.problems, checked!.args)).toEqual({ field: "name", text: "No name", fix: null, fixLabel: null });
  });

  it("offers the fixes the board draws", () => {
    const [category] = checkRows([row(14, { name: "Savanna Dry 330ml", category: "Ciders", price: "2.10" })], ctx);
    expect(problemView(category!.problems, category!.args)).toMatchObject({ field: "category", fix: "CREATE_CATEGORY", fixLabel: "Create the category" });
    const [alike] = checkRows([row(58, { name: "Coca Cola 2l", price: "2.50" })], ctx);
    expect(problemView(alike!.problems, alike!.args)).toMatchObject({ field: "name", fix: "UPDATE_MATCH", fixLabel: "Update that one" });
  });

  it("matches a category by name or path, never by part of one", () => {
    expect(first({ name: "Amarula", price: "18.00", category: "Spirits · Liqueur" })).toBeNull();
    expect(first({ name: "Hunters Gold", price: "2.00", category: "Ciders" })).toBe("Category “Ciders” is new");
  });

  it("names the first row with the same barcode, and leaves that first row alone", () => {
    const checked = checkRows(
      [row(4, { name: "A", price: "1.00", barcode: "60011111" }), row(7, { name: "B", price: "1.00", barcode: "6001 1111" })],
      ctx,
    );
    expect(checked[0]!.problems).toEqual([]);
    expect(problemView(checked[1]!.problems, checked[1]!.args)?.text).toBe("Same barcode as row 4");
  });

  it("flags a cost, opening stock or pack size the commit would refuse, with what was typed", () => {
    expect(first({ name: "H", price: "2.10", cost: "abc" })).toBe("Cost “abc” is not a figure");
    expect(first({ name: "H", price: "2.10", cost: "1,20" })).toBe("Cost “1,20” is not a figure");
    expect(first({ name: "I", price: "2.10", cost: "1", openingStock: "-5" })).toBe("Opening stock “-5” is not a whole number");
    expect(first({ name: "I", price: "2.10", openingStock: "2.5" })).toBe("Opening stock “2.5” is not a whole number");
    expect(first({ name: "Castle case", price: "26.00", packSize: "a dozen" })).toBe("Pack size “a dozen” is not a whole number");
    expect(problemView(checkRows([row(2, { name: "H", price: "2.10", cost: "x" })], ctx)[0]!.problems, {})?.field).toBeNull();
    expect(first({ name: "Fine", price: "2.10", cost: "1.20", openingStock: "48", packSize: "24" })).toBeNull();
  });

  it("reads opening stock and pack size only for a new product, and cost for both", () => {
    // Coca-Cola 2l is in Products: its row updates it, and stock and pack size are not read.
    expect(first({ name: "Coca-Cola 2l", price: "2.50", openingStock: "-5", packSize: "x" })).toBeNull();
    expect(first({ name: "Coca-Cola 2l", price: "2.50", cost: "abc" })).toBe("Cost “abc” is not a figure");
  });

  it("names the first row with the same new name, any case, and leaves that row alone", () => {
    const checked = checkRows([row(13, { name: "Same", price: "2.10" }), row(14, { name: "same ", price: "2.20" })], ctx);
    expect(checked[0]!.problems).toEqual([]);
    expect(problemView(checked[1]!.problems, checked[1]!.args)).toMatchObject({ field: "name", text: "Same name as row 13" });
  });

  it("names the first row for the same product, by barcode or by name", () => {
    const checked = checkRows(
      [row(5, { name: "Coke big", price: "2.50", barcode: "5449000000996" }), row(9, { name: "coca-cola 2l", price: "2.60" })],
      ctx,
    );
    expect(checked[0]).toMatchObject({ problems: [], action: "UPDATE", matchedProductId: "coke" });
    expect(checked[1]).toMatchObject({ action: "UPDATE", matchedProductId: "coke" });
    expect(problemView(checked[1]!.problems, checked[1]!.args)?.text).toBe("Same product as row 5");
  });

  it("an accepted look-alike updates it", () => {
    const [checked] = checkRows([{ ...row(58, { name: "Coca Cola 2l", price: "2.50" }), acceptedMatchId: "coke" }], ctx);
    expect(checked).toMatchObject({ problems: [], action: "UPDATE", matchedProductId: "coke", args: { matchedName: "Coca-Cola 2l" } });
  });
});
