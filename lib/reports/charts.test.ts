import { describe, expect, it } from "vitest";

import { barsSvg, bucketFor, compact, niceTicks, seriesBy, timeSeries, trendSvg } from "./charts";
import { defaultLayout, fitLayout, layoutRows } from "./layout";
import type { ReportColumn, ReportRow } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "stage", label: "Stage", kind: "status" },
  { key: "closes", label: "Closes", kind: "date" },
  { key: "value", label: "Value", kind: "money", total: "sum" },
];

const ROWS: ReportRow[] = [
  { id: "1", title: "A", stage: "Won", closes: "2026-09-01", value: 100 },
  { id: "2", title: "B", stage: "Open", closes: "2026-09-01", value: 50 },
  { id: "3", title: "C", stage: "Won", closes: "2026-09-03", value: 25 },
  { id: "4", title: "D", stage: null, closes: null, value: 10 },
];

const COLORS = { mark: "#0b5df0", grid: "#e4e4e7", text: "#18181b", muted: "#71717a", surface: "#fff" };

describe("seriesBy", () => {
  it("measures each group, largest first, with blanks as None", () => {
    expect(seriesBy(ROWS, COLUMNS[1]!, { column: "value", fn: "sum" }, COLUMNS, 8, String)).toEqual([
      { label: "Won", value: 125 },
      { label: "Open", value: 50 },
      { label: "None", value: 10 },
    ]);
  });

  it("counts rows when there is no measure, and folds the tail into Other", () => {
    expect(seriesBy(ROWS, COLUMNS[1]!, undefined, COLUMNS, 2, String)).toEqual([
      { label: "Won", value: 2 },
      { label: "Other (2)", value: 2 },
    ]);
  });
});

describe("timeSeries", () => {
  it("draws every day in the range, empty ones as nothing for a total", () => {
    const { points, bucket } = timeSeries(ROWS, COLUMNS[2]!, { column: "value", fn: "sum" }, COLUMNS);
    expect(bucket).toBe("day");
    expect(points).toEqual([
      { label: "1 Sep", value: 150 },
      { label: "2 Sep", value: 0 },
      { label: "3 Sep", value: 25 },
    ]);
  });

  it("leaves a gap for an average where there was nothing to average", () => {
    const { points } = timeSeries(ROWS, COLUMNS[2]!, { column: "value", fn: "avg" }, COLUMNS);
    expect(points.map((point) => point.value)).toEqual([75, null, 25]);
  });

  it("takes weeks for a season and months for a year", () => {
    expect(bucketFor("2026-01-01", "2026-03-01")).toBe("week");
    expect(bucketFor("2025-01-01", "2026-03-01")).toBe("month");
    const { points } = timeSeries(ROWS, COLUMNS[2]!, undefined, COLUMNS, { from: "2026-01-01", to: "2026-09-28" });
    expect(points[0]!.label).toBe("Jan 2026");
    expect(points[points.length - 1]!.label).toBe("Sep 2026");
    expect(points[points.length - 1]!.value).toBe(3);
  });
});

describe("axes", () => {
  it("steps in ones, twos and fives, past the top value", () => {
    expect(niceTicks(9300)).toEqual([0, 5000, 10000]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0)).toEqual([0]);
    expect(compact(12500)).toBe("12.5K");
    expect(compact(2_300_000)).toBe("2.3M");
  });
});

describe("the pictures", () => {
  const points = [
    { label: "Won <best>", value: 125 },
    { label: "Open", value: 50 },
  ];

  it("draws a bar per point with its value at the tip, labels escaped, marks hoverable", () => {
    const svg = barsSvg(points, { width: 400, colors: COLORS, format: (v) => v.toFixed(2) });
    expect(svg.match(/class="chart-mark"/g)).toHaveLength(2);
    expect(svg).toContain("125.00");
    expect(svg).toContain("Won &lt;best&gt;");
    expect(svg).not.toContain("<best>");
  });

  it("draws the line, its wash and its end value", () => {
    const svg = trendSvg(
      [
        { label: "1 Sep", value: 10 },
        { label: "2 Sep", value: null },
        { label: "3 Sep", value: 30 },
      ],
      { width: 500, colors: COLORS, format: (v) => String(v) },
    );
    // Two segments either side of the gap, each a wash and a line.
    expect(svg.match(/fill-opacity="0.1"/g)).toHaveLength(2);
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain(">30<");
  });
});

describe("defaultLayout", () => {
  it("leads with the figures, puts a breakdown beside a trend, and ends with the table", () => {
    const layout = defaultLayout({ columns: COLUMNS });
    expect(layout.blocks.map((block) => block.type)).toEqual(["figures", "chart", "chart", "table"]);
    expect(layout.blocks.slice(1, 3)).toMatchObject([
      { form: "bars", by: "stage", measure: { column: "value", fn: "sum" }, half: true },
      { form: "trend", by: "closes", half: true },
    ]);
    expect(layoutRows(layout.blocks).map((row) => row.length)).toEqual([1, 2, 1]);
  });

  it("gives a lone half block the row to itself, and never halves the table", () => {
    const rows = layoutRows([
      { id: "a", type: "figures", half: true },
      { id: "t", type: "table" },
      { id: "b", type: "text", text: "x", half: true },
    ]);
    expect(rows.map((row) => row.map((block) => block.id))).toEqual([["a"], ["t"], ["b"]]);
  });

  it("drops what a report no longer has", () => {
    const fitted = fitLayout(defaultLayout({ columns: COLUMNS }), COLUMNS.filter((column) => column.key !== "closes"));
    expect(fitted.blocks.map((block) => block.id)).toEqual(["figures", "by", "table"]);
  });
});
