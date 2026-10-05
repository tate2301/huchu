import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getReportDefinition } from "@/lib/reports/registry";
import type { ReportRow } from "@/lib/reports/types";

import { ListCell } from "./list-cell";
import { ListPager } from "./list-pager";
import { EmptyGuide, NoMatch, Refusal } from "./list-states";
import { SaveBar } from "./save-bar";
import { SelectionBar } from "./selection-bar";
import { TotalsBand } from "./totals-band";
import { gridTemplate } from "./model";

const list = getReportDefinition("retail-shifts")!.list!;
const column = (key: string) => list.columns.find((entry) => entry.key === key)!;
const row = (values: Partial<ReportRow>): ReportRow => ({ id: "s-238", ...values }) as ReportRow;

describe("ListCell (Cells board)", () => {
  it("draws the reference as the row's only link, in mono", () => {
    const html = renderToStaticMarkup(
      <ListCell column={column("shiftNo")} row={row({ shiftNo: "SH-00238" })} rowHref="/retail/shifts/s-238" />,
    );
    expect(html).toBe('<a class="cx-lf-ref" href="/retail/shifts/s-238">SH-00238</a>');
  });

  it("draws a state as a badge with its word", () => {
    const html = renderToStaticMarkup(<ListCell column={column("state")} row={row({ state: "Not counted" })} />);
    expect(html).toBe('<span class="cx-state cx-state--pending">Not counted</span>');
  });

  it("draws a difference as a signed pill, and nothing as a dash", () => {
    expect(renderToStaticMarkup(<ListCell column={column("variance")} row={row({ variance: -7.15 })} />)).toBe(
      '<span class="cx-lf-pill cx-lf-pill--bad">−US$7.15</span>',
    );
    expect(renderToStaticMarkup(<ListCell column={column("variance")} row={row({ variance: null })} />)).toBe(
      '<span class="cx-lf-none">—</span>',
    );
  });

  it("draws the day in words and the time in mono", () => {
    const html = renderToStaticMarkup(
      <ListCell column={column("openedAt")} row={row({ openedAt: "2026-08-15", openedTime: "18:14" })} />,
    );
    expect(html).toBe('15 August 2026<span class="cx-lf-time"> 18:14</span>');
  });

  it("tells a running, a stale and a closed drawer apart", () => {
    const duration = column("durationMinutes");
    expect(renderToStaticMarkup(<ListCell column={duration} row={row({ durationMinutes: 372, running: true })} />)).toContain(
      'class="cx-lf-dur cx-lf-dur--running" title="Still trading, open for 6h 12m"',
    );
    expect(renderToStaticMarkup(<ListCell column={duration} row={row({ durationMinutes: 3170, running: true })} />)).toContain(
      'title="Open for 52h 50m, longer than a shift"',
    );
    expect(renderToStaticMarkup(<ListCell column={duration} row={row({ durationMinutes: 420, running: false })} />)).toContain(
      'title="Ran for 7h 00m">7h 00m',
    );
  });
});

describe("TotalsBand (5.4.8)", () => {
  const columns = list.columns;
  const template = gridTemplate(columns);

  it("sums every row the filters let through: Σ, the count, the summary and the figures", () => {
    const html = renderToStaticMarkup(
      <TotalsBand
        noun="shifts"
        columns={columns}
        template={template}
        total={312}
        totals={{ sales: 8412, takings: 71904.35, variance: -186.42 }}
        summary={{ state: { count: 23, label: "to check", tone: "pending" } }}
        selected={null}
      />,
    );
    expect(html).toContain('aria-label="Totals for every shift the filters let through"');
    expect(html).toContain(">Σ</div>");
    expect(html).toContain(">312</div>");
    expect(html).toContain('<span class="cx-lf-summary"><span class="mono">23</span> to check</span>');
    expect(html).toContain(">8,412</div>");
    expect(html).toContain(">US$71,904.35</div>");
    expect(html).toMatch(/is-bad"[^>]*>−US\$186.42<\/div>/);
    expect(html).not.toContain("Totals for the selected shifts");
  });

  it("adds the selected line while rows are ticked", () => {
    const html = renderToStaticMarkup(
      <TotalsBand
        noun="shifts"
        columns={columns}
        template={template}
        total={312}
        totals={{}}
        summary={{}}
        selected={{ count: 3, totals: { sales: 217, takings: 1984.05, variance: -15.79 } }}
      />,
    );
    expect(html).toContain('aria-label="Totals for the selected shifts"');
    expect(html).toContain(">217</div>");
    expect(html).toContain(">US$1,984.05</div>");
    expect(html).toContain(">−US$15.79</div>");
  });
});

describe("SelectionBar (Selected board)", () => {
  const bulk = list.bulk!;
  const render = (foldCount: number) =>
    renderToStaticMarkup(
      <SelectionBar
        noun="shifts"
        count={3}
        total={312}
        allSelected={false}
        selectingAll={false}
        bulk={bulk}
        foldCount={foldCount}
        hideSelectAll={false}
        onClear={() => {}}
        onSelectAll={() => {}}
        onAction={() => {}}
        onExport={() => {}}
      />,
    );

  it("reads 3 selected · Select all 312 │ Print Z-reports · Export 3 · Copy shift numbers · ⋯", () => {
    const html = render(0);
    expect(html).toContain('aria-label="Selected shifts"');
    expect(html).toContain('<span class="mono">3</span> selected');
    expect(html).toContain('Select all <span class="mono">312</span>');
    expect(html.indexOf("Print Z-reports")).toBeLessThan(html.indexOf("Export"));
    expect(html.indexOf("Export")).toBeLessThan(html.indexOf("Copy shift numbers"));
    expect(html).toContain('aria-label="More actions for the selection"');
  });

  it("folds actions into ⋯ from the right as it narrows", () => {
    expect(render(2)).not.toContain("Copy shift numbers");
    expect(render(2)).toContain("Print Z-reports");
  });
});

describe("ListPager (Paging board)", () => {
  it('reads "1–50 of 312", rows per page, and the current page in ink', () => {
    const html = renderToStaticMarkup(
      <ListPager page={1} pages={7} size={50} total={312} shown={50} hints={false} scrolled={false} onPage={() => {}} onSize={() => {}} onTop={() => {}} />,
    );
    expect(html).toContain('<span class="cx-lf-pager__fig">1–50</span>');
    expect(html).toContain('of <span class="cx-lf-pager__fig">312</span>');
    expect(html).toContain("Rows per page");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("Back to top");
  });

  it('reads "0 of 0" with no page buttons when nothing matches', () => {
    const html = renderToStaticMarkup(
      <ListPager page={1} pages={1} size={50} total={0} shown={0} hints={false} scrolled={false} onPage={() => {}} onSize={() => {}} onTop={() => {}} />,
    );
    expect(html).toContain('<span class="cx-lf-pager__fig">0</span> of <span class="cx-lf-pager__fig">0</span>');
    expect(html).not.toContain("Previous page");
  });
});

describe("states (5.4.11)", () => {
  it("says no row matches, with a way out", () => {
    const html = renderToStaticMarkup(<NoMatch noun="shifts" onClear={() => {}} />);
    expect(html).toContain("No shifts match these filters.");
    expect(html).toContain("Clear filters");
  });

  it("refuses a role in words", () => {
    const html = renderToStaticMarkup(<Refusal noun="shifts" back={{ href: "/retail/stock", label: "On hand" }} />);
    expect(html).toContain("Your role cannot view shifts.");
    expect(html).toContain("Back to On hand");
  });

  it("draws the empty guide from the source", () => {
    const html = renderToStaticMarkup(<EmptyGuide guide={list.empty} primaryHref="/retail/shifts?sheet=shift-open" />);
    expect(html).toContain("No shifts yet");
    expect(html).toContain("A shift starts when a cashier opens a till with its float. Each one closes with a count.");
    expect(html).toContain('href="/retail/shifts?sheet=shift-open"');
    expect(html).toContain("Open shift");
  });

  it("holds unsaved edits in the save bar", () => {
    const html = renderToStaticMarkup(
      <SaveBar
        count={3}
        changedLabel="prices changed"
        note="The till picks them up the moment you save."
        save="Save prices"
        saving={false}
        onDiscard={() => {}}
        onSave={() => {}}
      />,
    );
    expect(html).toContain('role="region" aria-label="Unsaved changes"');
    expect(html).toContain('<span class="mono">3</span> prices changed');
    expect(html).toContain("Discard");
    expect(html).toContain("Save prices");
  });
});
