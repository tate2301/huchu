import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { ExportInput } from "./export-templates";
import { buildWorkbook, cellValue } from "./export-xlsx";
import type { ReportMeta, ReportRow, ReportView } from "./types";
import { applyView, defaultView } from "./view";

const META: ReportMeta = {
  key: "crm-deals",
  title: "Deals: open / won [2026]",
  area: "Sales",
  params: [
    { key: "from", label: "Closing", type: "date" },
    { key: "to", label: "To", type: "date" },
  ],
  columns: [
    { key: "dealNo", label: "Deal", kind: "code" },
    { key: "stage", label: "Stage", kind: "status" },
    { key: "closes", label: "Closes", kind: "date" },
    { key: "value", label: "Value", kind: "money", total: "sum" },
  ],
  defaults: {},
};

const ROWS: ReportRow[] = [
  { id: "1", dealNo: "0012", stage: "Won", closes: "2026-09-02", value: 1200 },
  { id: "2", dealNo: "0013", stage: "Open", closes: null, value: 800.5 },
  { id: "3", dealNo: "0014", stage: "Won", closes: "2026-09-20", value: 300 },
];

async function read(view: ReportView = defaultView(META)) {
  const input: ExportInput = {
    meta: META,
    params: { from: "2026-09-01", to: "2026-09-30" },
    applied: applyView(ROWS, META.columns, view),
    view: { ...view, search: view.search },
    selected: false,
    generatedAt: new Date("2026-09-28T10:00:00Z"),
  };
  const workbook = new ExcelJS.Workbook();
  const bytes = await buildWorkbook(input);
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  return workbook;
}

describe("buildWorkbook", () => {
  it("names its sheets, the report's made safe for Excel", async () => {
    const workbook = await read();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Deals open won 2026", "Summary", "About"]);
  });

  it("writes typed values under a frozen, filterable header", async () => {
    const sheet = (await read()).worksheets[0]!;
    expect(sheet.getRow(1).values).toEqual([undefined, "Deal", "Stage", "Closes", "Value"]);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
    const first = sheet.getRow(2);
    // A reference stays text, so its leading zeros survive.
    expect(first.getCell(1).value).toBe("0012");
    expect(first.getCell(3).value).toEqual(new Date("2026-09-02T00:00:00.000Z"));
    expect(first.getCell(3).numFmt).toBe("d mmm yyyy");
    expect(first.getCell(4).value).toBe(1200);
    expect(first.getCell(4).numFmt).toBe("#,##0.00");
    expect(sheet.getRow(3).getCell(3).value).toBeNull();
  });

  it("totals with SUBTOTAL, so a filter in Excel moves the total", async () => {
    const sheet = (await read()).worksheets[0]!;
    const total = sheet.getRow(5);
    expect(total.getCell(1).value).toBe("Total");
    expect(total.getCell(4).value).toMatchObject({ formula: "SUBTOTAL(109,D2:D4)", result: 2300.5 });
  });

  it("prints groups as headed sections with their subtotals, and the whole set last", async () => {
    const sheet = (await read({ ...defaultView(META), groupBy: "stage" })).worksheets[0]!;
    // Won (2 rows) then Open (1 row), as applyView grouped them.
    expect(sheet.getRow(2).getCell(1).value).toBe("Won (2)");
    expect(sheet.getRow(2).getCell(4).value).toMatchObject({ formula: "SUBTOTAL(109,D3:D4)", result: 1500 });
    expect(sheet.getRow(3).getCell(1).value).toBe("0012");
    expect(sheet.getRow(5).getCell(1).value).toBe("Open (1)");
    expect(sheet.getRow(5).getCell(4).value).toMatchObject({ formula: "SUBTOTAL(109,D6:D6)", result: 800.5 });
    // SUBTOTAL skips the headings' SUBTOTALs, so the last row is the whole set once.
    const total = sheet.getRow(7);
    expect(total.getCell(1).value).toBe("Total");
    expect(total.getCell(4).value).toMatchObject({ formula: "SUBTOTAL(109,D2:D6)", result: 2300.5 });
  });

  it("summarises by the first state, largest first, with its share", async () => {
    const summary = (await read()).getWorksheet("Summary")!;
    expect(summary.getRow(1).values).toEqual([undefined, "Stage", "Rows", "Value", "Share of value"]);
    expect(summary.getRow(2).values).toEqual([undefined, "Won", 2, 1500, 1500 / 2300.5]);
    expect(summary.getRow(2).getCell(4).numFmt).toBe("0.0%");
    expect(summary.getRow(4).getCell(1).value).toBe("Total");
  });

  it("says what it is a picture of", async () => {
    const about = (await read({ ...defaultView(META), search: "00" })).getWorksheet("About")!;
    const facts = about.getSheetValues().filter(Boolean).map((row) => (row as unknown[]).slice(1));
    expect(facts).toContainEqual(["Period", "1 Sep 2026 – 30 Sep 2026"]);
    expect(facts).toContainEqual(["Showing", "Search: “00”"]);
    expect(facts).toContainEqual(["Rows", "3"]);
  });
});

describe("cellValue", () => {
  it("keeps what is not a number as text and blanks as empty", () => {
    expect(cellValue("12a", { key: "x", label: "X", kind: "number" })).toBe("12a");
    expect(cellValue("", { key: "x", label: "X", kind: "text" })).toBeNull();
    expect(cellValue(true, { key: "x", label: "X", kind: "text" })).toBe("Yes");
  });
});
