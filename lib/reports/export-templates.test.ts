import { describe, expect, it } from "vitest";

import {
  breakdownColumn,
  EXPORT_TEMPLATES,
  exportDocument,
  leadFigure,
  MAX_SHEETS,
  type ExportInput,
} from "./export-templates";
import type { ReportMeta, ReportRow, ReportView } from "./types";
import { applyView, defaultView } from "./view";

const META: ReportMeta = {
  key: "crm-deals",
  title: "Deals",
  area: "Sales",
  params: [
    { key: "from", label: "Closing", type: "date" },
    { key: "to", label: "To", type: "date" },
    { key: "owner", label: "Owner", type: "choice", options: [{ value: "all", label: "Everyone" }, { value: "me", label: "Mine" }] },
  ],
  columns: [
    { key: "dealNo", label: "Deal", kind: "code" },
    { key: "title", label: "Title", kind: "text" },
    { key: "stage", label: "Stage", kind: "status" },
    { key: "value", label: "Value", kind: "money", total: "sum" },
    { key: "notes", label: "Notes", kind: "text", hidden: true },
  ],
  defaults: {},
};

const ROWS: ReportRow[] = [
  { id: "1", dealNo: "D-1", title: "Logo mats <b>", stage: "Won", value: 1200, notes: "repeat" },
  { id: "2", dealNo: "D-2", title: "Entrance", stage: "Open", value: 800.5, notes: null },
  { id: "3", dealNo: "D-3", title: "Warehouse", stage: "Won", value: 300, notes: null },
];

function input(view: ReportView = defaultView(META), rows = ROWS): ExportInput {
  return {
    meta: META,
    params: { from: "2026-09-01", to: "2026-09-30", owner: "me" },
    applied: applyView(rows, META.columns, view),
    view,
    selected: false,
    generatedAt: new Date("2026-09-28T10:00:00Z"),
  };
}

describe("choosing what a summary is about", () => {
  it("breaks down by the view's grouping, else by its first state", () => {
    expect(breakdownColumn({ meta: META, view: defaultView(META) })?.key).toBe("stage");
    expect(breakdownColumn({ meta: META, view: { ...defaultView(META), groupBy: "title" } })?.key).toBe("title");
  });

  it("leads with the summed money", () => {
    expect(leadFigure({ meta: META, view: defaultView(META) })?.key).toBe("value");
    expect(leadFigure({ meta: META, view: { ...defaultView(META), totals: {} } })).toBeNull();
  });
});

describe("exportDocument", () => {
  it.each(EXPORT_TEMPLATES)("%s prints the period, what narrowed it, and escapes what it prints", (template) => {
    const document = exportDocument(template, input({ ...defaultView(META), search: "mat" }, ROWS));
    expect(document.subtitle).toBe("1 Sep 2026 – 30 Sep 2026");
    expect(document.stamp).toEqual([{ label: "Generated", value: "28 Sep 2026" }]);
    expect(document.content).toContain("Owner: Mine");
    expect(document.content).toContain("Search: “mat”");
    expect(document.content).not.toContain("<b>");
  });

  it("report prints the default layout: figures, the chart, then the rows", () => {
    const content = exportDocument("layout", input()).content;
    // No date column, so no trend: one chart, full width.
    expect(content.match(/<svg /g)).toHaveLength(1);
    expect(content).toContain("Value by stage");
    expect(content).not.toContain("rp-columns");
    expect(content.indexOf("rp-figures")).toBeLessThan(content.indexOf("rp-chart"));
    expect(content.indexOf("rp-chart")).toBeLessThan(content.indexOf("rp-table-block"));
  });

  it("report follows a declared layout, and leaves out what it does not have", () => {
    const declared: ReportMeta = {
      ...META,
      layout: {
        blocks: [
          { id: "h", type: "heading", text: "Pipeline <review>", level: 1 },
          { id: "b", type: "breakdown", limit: 5 },
          { id: "gone", type: "chart", form: "bars", by: "vanished", limit: 8 },
        ],
      },
    };
    const content = exportDocument("layout", { ...input(), meta: declared }).content;
    expect(content).toContain("Pipeline &lt;review&gt;");
    expect(content).toContain("By stage");
    expect(content).not.toContain("<svg ");
    expect(content).not.toContain("rp-table-block");
  });

  it("register prints every row, a subtotal per group and the total", () => {
    const content = exportDocument("register", input({ ...defaultView(META), groupBy: "stage" })).content;
    expect(content.match(/<tr class="rp-group">/g)).toHaveLength(2);
    expect(content).toContain("Won total");
    expect(content).toContain("1,500.00");
    expect(content).toContain("2,300.50");
  });

  it("summary gives one line per group, largest first, with its share", () => {
    const content = exportDocument("summary", input()).content;
    expect(content.indexOf(">Won<")).toBeLessThan(content.indexOf(">Open<"));
    expect(content).toContain("65.2%");
    expect(content).toContain("34.8%");
  });

  it("pack leads with the figures, then the largest rows, then everything on a new page", () => {
    const content = exportDocument("pack", input()).content;
    expect(content.indexOf("rp-figures")).toBeLessThan(content.indexOf("Largest by value"));
    expect(content.indexOf("Largest by value")).toBeLessThan(content.indexOf(`<div class="rp-break">`));
    expect(content).toContain("Every row");
  });

  it("sheets print every field of every row, hidden ones included", () => {
    const content = exportDocument("sheets", input()).content;
    expect(content.match(/<article class="rp-sheet">/g)).toHaveLength(3);
    expect(content).toContain("Notes");
    expect(content).toContain("repeat");
  });

  it("sheets stop at a ream and say so", () => {
    const many = Array.from({ length: MAX_SHEETS + 5 }, (_, index) => ({ ...ROWS[0]!, id: String(index) }));
    const content = exportDocument("sheets", input(defaultView(META), many)).content;
    expect(content.match(/<article class="rp-sheet">/g)).toHaveLength(MAX_SHEETS);
    expect(content).toContain(`The first ${MAX_SHEETS} of ${MAX_SHEETS + 5} rows`);
  });

  it("folds a long breakdown into its largest groups and the others", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ ...ROWS[0]!, id: String(index), stage: `S${index}`, value: index + 1 }));
    const content = exportDocument("pack", input(defaultView(META), rows)).content;
    expect(content).toContain("9 others");
  });
});
