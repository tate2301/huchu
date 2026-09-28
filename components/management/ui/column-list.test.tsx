/**
 * The list the money pages draw their rows with: every column named once, in
 * the header line, and only the row's name a link (rule 6); a row that opens
 * says so to assistive tech and draws what it opens onto under itself; an
 * empty list says so once rather than drawing a header over nothing.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ColumnFigure, ColumnList, ColumnName } from "./column-list";
import { FactList } from "./fact-list";

const columns = [
  { id: "requisition", label: "Requisition" },
  { id: "status", label: "Status", hideBelow: "sm" as const },
  { id: "amount", label: "Amount", align: "end" as const },
];

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    cells: {
      requisition: <ColumnName code="REQ-0004" name="Diesel for the bakkie" meta="Tendai Rep" href={`/crm/requisitions/${id}`} />,
      status: "Waiting",
      amount: <ColumnFigure>USD 60.00</ColumnFigure>,
    },
    ...extra,
  };
}

describe("ColumnList", () => {
  it("names each column once, in the header line", () => {
    const html = renderToStaticMarkup(
      <ColumnList label="Requisitions" columns={columns} rows={[row("a"), row("b")]} />,
    );
    for (const label of ["Requisition", "Status", "Amount"]) {
      expect(html.match(new RegExp(`<th[^>]*>${label}</th>`, "g"))).toHaveLength(1);
    }
    expect(html).toContain('aria-label="Requisitions"');
  });

  it("links the name and nothing else in the row", () => {
    const html = renderToStaticMarkup(<ColumnList label="Requisitions" columns={columns} rows={[row("a")]} />);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/crm/requisitions/a"');
    expect(html).toContain("REQ-0004");
  });

  it("marks the columns a phone drops, and the figures that hang right", () => {
    const html = renderToStaticMarkup(<ColumnList label="Requisitions" columns={columns} rows={[row("a")]} />);
    expect(html).toMatch(/<th[^>]*data-hide="sm"[^>]*>Status<\/th>/);
    expect(html).toMatch(/<th[^>]*data-align="end"[^>]*>Amount<\/th>/);
  });

  it("says an empty list once, with no header over nothing", () => {
    const html = renderToStaticMarkup(
      <ColumnList label="Requisitions" columns={columns} rows={[]} empty="Nothing waiting on you." />,
    );
    expect(html).toContain("Nothing waiting on you.");
    expect(html).not.toContain("<table");
  });

  it("opens a row onto its detail, and says whether it is open", () => {
    const closed = renderToStaticMarkup(
      <ColumnList
        label="Money by project"
        columns={columns}
        rows={[row("a", { detail: <p>The requisitions</p>, expanded: false, onToggle: () => {} })]}
      />,
    );
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain("The requisitions");

    const open = renderToStaticMarkup(
      <ColumnList
        label="Money by project"
        columns={columns}
        rows={[row("a", { detail: <p>The requisitions</p>, expanded: true, onToggle: () => {} })]}
      />,
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("The requisitions");
    expect(open).toMatch(/<td[^>]*colSpan="3"|<td[^>]*colspan="3"/);
  });

  it("draws a totals row in the table's foot", () => {
    const html = renderToStaticMarkup(
      <ColumnList
        label="Money by project"
        columns={columns}
        rows={[row("a"), row("b")]}
        total={{ requisition: "Total", status: null, amount: <ColumnFigure>USD 120.00</ColumnFigure> }}
      />,
    );
    expect(html).toMatch(/<tfoot>[\s\S]*Total[\s\S]*USD 120\.00[\s\S]*<\/tfoot>/);
  });
});

describe("FactList", () => {
  it("is a label and its value per row, the value a link where it leads somewhere", () => {
    const html = renderToStaticMarkup(
      <FactList
        align="end"
        items={[
          { label: "Spent", value: "USD 310.50", mono: true },
          { label: "Spent directly", value: "USD 4.00", mono: true, href: "/crm/cost-tracker?type=SPENT" },
        ]}
      />,
    );
    expect(html.match(/<dt[^>]*>/g)).toHaveLength(2);
    expect(html).toMatch(/<dt[^>]*>Spent<\/dt><dd[^>]*data-mono="true"[^>]*>USD 310\.50<\/dd>/);
    expect(html).toContain('href="/crm/cost-tracker?type=SPENT"');
    expect(html).toContain('data-align="end"');
  });
});
