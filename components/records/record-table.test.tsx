import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RecordTable, type RecordTableColumn } from "./record-table";

/**
 * A grouped table (SHAPE-13): one heading per run of rows, carrying the
 * group's count across the whole list rather than the rows on this page, and
 * no headings at all when the list is not grouped.
 */
type Row = { id: string; name: string };

const ROWS: Row[] = [
  { id: "p1", name: "Blessing Moyo" },
  { id: "p2", name: "Anesu Dube" },
  { id: "p3", name: "Dudzai Zhou" },
];

const COLUMNS: RecordTableColumn<Row>[] = [{ id: "name", label: "Name", cell: (row) => row.name }];

function headings(html: string) {
  return [...html.matchAll(/<th scope="rowgroup"[^>]*>(.*?)<\/th>/g)].map((match) =>
    match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
}

describe("a grouped table", () => {
  it("heads each group's rows with its name and its count in the whole list", () => {
    const html = renderToStaticMarkup(
      <RecordTable
        rows={ROWS}
        columns={COLUMNS}
        groups={[
          { id: "rudo", label: "Rudo", count: 1, ids: ["p1"] },
          { id: "none", label: "Unassigned", count: 14, ids: ["p2", "p3"] },
        ]}
      />,
    );
    expect(headings(html)).toEqual(["Rudo 1", "Unassigned 14"]);
    // Each group is its own row group, and every row is still drawn.
    expect(html.match(/<tbody/g)).toHaveLength(2);
    for (const row of ROWS) expect(html).toContain(row.name);
  });

  it("draws no headings when the list is not grouped", () => {
    const html = renderToStaticMarkup(<RecordTable rows={ROWS} columns={COLUMNS} />);
    expect(headings(html)).toEqual([]);
    expect(html.match(/<tbody/g)).toHaveLength(1);
  });
});

describe("a column's menu", () => {
  it("is drawn in the column's own header", () => {
    const html = renderToStaticMarkup(
      <RecordTable rows={ROWS} columns={[{ ...COLUMNS[0], menu: <button type="button" aria-label="Name menu" /> }]} />,
    );
    const header = /<th scope="col"[^>]*>(.*?)<\/th>/g;
    const cells = [...html.matchAll(header)].map((match) => match[1]);
    expect(cells.some((cell) => cell.includes("Name") && cell.includes('aria-label="Name menu"'))).toBe(true);
  });
});
