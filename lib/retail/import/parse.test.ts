import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseSheet } from "./parse";
import { ImportRefusal } from "./refusal";

/** A products sheet (SET-11): headers in any case and order, rows by their own number, the limits in words. */

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ImportRefusal) return `${error.status} ${error.message}`;
    throw error;
  }
  return "no refusal";
}

describe("parseSheet", () => {
  it("reads headers in any case and order, money cells as money, and skips blank rows", async () => {
    const file = await xlsx([
      ["  barcode", "PRICE", "name ", "Category", "Opening Stock", "pack size"],
      ["6001496", 2.1, "Savanna Dry 330ml", "Ciders", 48, null],
      [],
      [null, "12,60", "Nederburg Cabernet", "Wine", null, null],
      ["6001108000012", 30, "Castle Lager 340ml case of 24", "Beer", null, 24],
    ]);
    const rows = await parseSheet(file, "price-list.xlsx");
    expect(rows).toEqual([
      { rowNo: 2, name: "Savanna Dry 330ml", category: "Ciders", price: "2.10", barcode: "6001496", cost: null, supplier: null, packSize: null, openingStock: "48" },
      { rowNo: 4, name: "Nederburg Cabernet", category: "Wine", price: "12,60", barcode: null, cost: null, supplier: null, packSize: null, openingStock: null },
      { rowNo: 5, name: "Castle Lager 340ml case of 24", category: "Beer", price: "30.00", barcode: "6001108000012", cost: null, supplier: null, packSize: "24", openingStock: null },
    ]);
  });

  it("finds the header under the template's note row", async () => {
    const file = await xlsx([["Name and price are needed."], ["Name", "Price"], ["Ice 5kg bag", "3.00"]]);
    expect(await parseSheet(file, "template.xlsx")).toMatchObject([{ rowNo: 3, name: "Ice 5kg bag", price: "3.00" }]);
  });

  it("reads a CSV with every cell as typed", async () => {
    const csv = Buffer.from('Name,Price,Barcode\n"Mazoe Orange 2l",4.20,600169\n"Nederburg Cabernet","12,60",\n');
    expect(await parseSheet(csv, "list.csv")).toEqual([
      { rowNo: 2, name: "Mazoe Orange 2l", category: null, price: "4.20", barcode: "600169", cost: null, supplier: null, packSize: null, openingStock: null },
      { rowNo: 3, name: "Nederburg Cabernet", category: null, price: "12,60", barcode: null, cost: null, supplier: null, packSize: null, openingStock: null },
    ]);
  });

  it("refuses a file without Name and Price columns", async () => {
    expect(await refusal(parseSheet(await xlsx([["Name", "Cost"], ["Ice", 1]]), "a.xlsx"))).toBe("400 Name and price columns are needed.");
    expect(await refusal(parseSheet(Buffer.from("Product,Price\nIce,3\n"), "a.csv"))).toBe("400 Name and price columns are needed.");
  });

  it("refuses anything but .xlsx or .csv, and an .xlsx that is not one", async () => {
    expect(await refusal(parseSheet(Buffer.from("%PDF-1.4"), "list.pdf"))).toBe("400 Upload an .xlsx or .csv file.");
    expect(await refusal(parseSheet(Buffer.from("not a zip"), "list.xlsx"))).toBe("400 Upload an .xlsx or .csv file.");
  });

  it("refuses more than 5,000 rows and more than 5 MB", async () => {
    const lines = ["Name,Price", ...Array.from({ length: 5_001 }, (_, i) => `Item ${i},1.00`)].join("\n");
    expect(await refusal(parseSheet(Buffer.from(lines), "big.csv"))).toBe("400 Keep it to 5,000 rows.");
    const ok = ["Name,Price", ...Array.from({ length: 5_000 }, (_, i) => `Item ${i},1.00`)].join("\n");
    expect(await parseSheet(Buffer.from(ok), "ok.csv")).toHaveLength(5_000);
    expect(await refusal(parseSheet(Buffer.alloc(5 * 1024 * 1024 + 1), "huge.csv"))).toBe("400 The file is over 5 MB.");
  });
});
