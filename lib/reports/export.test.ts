import { describe, expect, it } from "vitest";

import { exportFileName, exportRows } from "./export";
import type { ReportMeta, ReportRow, ReportView } from "./types";
import { applyView, defaultView } from "./view";

const META: ReportMeta = {
  key: "crm-deals",
  title: "Deals",
  area: "Sales",
  params: [
    { key: "from", label: "From", type: "date" },
    { key: "to", label: "To", type: "date" },
  ],
  columns: [
    { key: "title", label: "Title", kind: "text" },
    { key: "stage", label: "Stage", kind: "status" },
    { key: "value", label: "Value", kind: "money", total: "sum" },
  ],
  defaults: {},
};

const ROWS: ReportRow[] = [
  { id: "1", title: 'Mats, "logo"', stage: "Won", value: 1200 },
  { id: "2", title: "Entrance", stage: "Open", value: 800.5 },
  { id: "3", title: "Warehouse", stage: "Won", value: 300 },
];

const PARAMS = { from: "2026-09-01", to: "2026-09-30" };

describe("exportRows", () => {
  it("writes raw values under the column labels, quoting what needs it, with a total", () => {
    const view = defaultView(META);
    expect(exportRows(applyView(ROWS, META.columns, view), view).split("\n")).toEqual([
      "Title,Stage,Value",
      '"Mats, ""logo""",Won,1200',
      "Entrance,Open,800.5",
      "Warehouse,Won,300",
      "Total,,2300.5",
      "",
    ]);
  });

  it("keeps the columns the view shows, in its order", () => {
    const view: ReportView = {
      ...defaultView(META),
      columns: [
        { key: "value", hidden: false },
        { key: "title", hidden: false },
        { key: "stage", hidden: true },
      ],
      totals: {},
    };
    expect(exportRows(applyView(ROWS, META.columns, view), view).split("\n")[0]).toBe("Value,Title");
  });
});

describe("exportFileName", () => {
  it("names the file after the report, its layout and its dates", () => {
    expect(exportFileName(META, PARAMS, "pdf")).toBe("deals_2026-09-01_2026-09-30.pdf");
    expect(exportFileName(META, PARAMS, "pdf", "pack")).toBe("deals-pack_2026-09-01_2026-09-30.pdf");
  });
});
