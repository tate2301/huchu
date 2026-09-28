import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { renderXlsx, sheetName } from "./xlsx-renderer";

async function open(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

describe("renderXlsx", () => {
  it("writes typed cells under a bold, frozen, filtered header", async () => {
    const sheet = await open(
      await renderXlsx({
        title: "Deals: closing / this month",
        columns: [
          { key: "name", label: "Deal", kind: "text" },
          { key: "value", label: "Value", kind: "money" },
          { key: "count", label: "Contacts", kind: "number" },
          { key: "close", label: "Close date", kind: "date" },
          { key: "updated", label: "Updated", kind: "datetime" },
          { key: "won", label: "Won", kind: "boolean" },
        ],
        rows: [
          {
            name: "=SUM(A1:A9)",
            value: 18400.5,
            count: "3",
            close: "2026-09-30",
            updated: "2026-09-27 14:05",
            won: true,
          },
        ],
      }),
    );

    expect(sheet.name).toBe("Deals closing this month");
    expect(sheet.getRow(1).values).toEqual([undefined, "Deal", "Value", "Contacts", "Close date", "Updated", "Won"]);
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();

    const row = sheet.getRow(2);
    // A formula-shaped name stays text: the cell has no formula.
    expect(row.getCell(1).value).toBe("=SUM(A1:A9)");
    expect(row.getCell(1).formula).toBeUndefined();
    expect(row.getCell(2).value).toBe(18400.5);
    expect(row.getCell(2).numFmt).toBe("#,##0.00");
    expect(row.getCell(3).value).toBe(3);
    expect(row.getCell(4).value).toEqual(new Date(Date.UTC(2026, 8, 30)));
    expect(row.getCell(5).value).toEqual(new Date(Date.UTC(2026, 8, 27, 14, 5)));
    expect(row.getCell(6).value).toBe("Yes");
  });

  it("leaves blanks blank", async () => {
    const sheet = await open(
      await renderXlsx({
        title: "People",
        columns: [
          { key: "email", label: "Email", kind: "email" },
          { key: "deals", label: "Deals", kind: "number" },
        ],
        rows: [{ email: null, deals: undefined }],
      }),
    );
    expect(sheet.getRow(2).getCell(1).value).toBeNull();
    expect(sheet.getRow(2).getCell(2).value).toBeNull();
  });
});

describe("sheetName", () => {
  it("drops what Excel refuses and keeps within its length", () => {
    expect(sheetName("A/B\\C?D*E[F]G:H")).toBe("A B C D E F G H");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName("   ")).toBe("Export");
  });
});
