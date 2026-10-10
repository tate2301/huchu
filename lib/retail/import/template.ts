import ExcelJS from "exceljs";

import { liveCategories } from "@/lib/retail/categories";

import { COLUMNS_READ, HOW_MATCHED, IMPORT_COLUMNS } from "./words";

export const TEMPLATE_FILE = "tender-products-template.xlsx";

/**
 * The products template (SET-11): a note row, the eight columns under it with
 * the header frozen, and the shop's categories on a second sheet to copy from.
 */
export async function productsTemplate(companyId: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow([`${COLUMNS_READ} ${HOW_MATCHED} Prices like 2.10; a pack size of 24 makes the row a case of 24.`]);
  sheet.mergeCells(1, 1, 1, IMPORT_COLUMNS.length);
  sheet.getRow(1).font = { italic: true, color: { argb: "FF6B6B6B" } };
  sheet.getRow(1).alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(1).height = 32;
  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.getRow(2).font = { bold: true };
  IMPORT_COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column === "Name" ? 32 : column === "Category" || column === "Supplier" ? 22 : 14;
  });
  for (const column of ["Price", "Cost"] as const) {
    sheet.getColumn(IMPORT_COLUMNS.indexOf(column) + 1).numFmt = "0.00";
  }
  sheet.getColumn(IMPORT_COLUMNS.indexOf("Barcode") + 1).numFmt = "@";
  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const categories = workbook.addWorksheet("Categories");
  categories.addRow(["Category"]);
  categories.getRow(1).font = { bold: true };
  categories.getColumn(1).width = 36;
  for (const category of await liveCategories(companyId)) categories.addRow([category.path]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
