import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListCell } from "@/components/list-frame/list-cell";
import { getReportDefinition } from "@/lib/reports/registry";
import type { ReportRow } from "@/lib/reports/types";
import type { RailRow } from "@/lib/retail/record-kinds/types";

import { ChartPanel } from "./chart-panel";
import { DetailRow } from "./detail-row";

const months = (values: number[]) =>
  values.map((value, index) => ({ label: `M${index}`, value, text: `US$${value.toFixed(2)}` }));
const tick = (value: number) => (value === 0 ? "0" : `US$${value}`);

describe("ChartPanel", () => {
  it("draws the empty state, not a made-up scale, while every bar is 0", () => {
    const html = renderToStaticMarkup(<ChartPanel chart={{ title: "Bought per month", unit: "US$", bars: months([0, 0, 0]), tick }} />);
    expect(html).toContain("Nothing to draw yet.");
    expect(html).not.toContain("US$1");
    expect(html).not.toContain("US$2");
  });

  it("draws the bars once one has a value", () => {
    const html = renderToStaticMarkup(<ChartPanel chart={{ title: "Bought per month", unit: "US$", bars: months([0, 120, 0]), tick }} />);
    expect(html).not.toContain("Nothing to draw yet.");
  });
});

const pays: RailRow = {
  key: "pays",
  label: "Pays",
  value: "30 days",
  edit: { field: "pays", type: "seg", options: ["On delivery", "7 days", "14 days", "30 days"], initial: "30 days", requires: ["retail.suppliers", "update"] },
};
const lead: RailRow = {
  key: "lead",
  label: "Lead time",
  value: "3 days",
  edit: { field: "leadTime", type: "text", initial: "3 days", requires: ["retail.suppliers", "update"] },
};
const row = (rail: RailRow, editing: boolean) =>
  renderToStaticMarkup(
    <DetailRow row={rail} editable editing={editing} saved={false} onEdit={() => {}} onCancel={() => {}} onSave={async () => {}} />,
  );

describe("DetailRow", () => {
  it("puts a choice on its own line across the row, with no save button: a pick saves", () => {
    const html = row(pays, true);
    expect(html).toContain('class="cx-rf-row cx-rf-row--seg"');
    expect(html).toContain('class="cx-rf-edit cx-rf-edit--seg"');
    expect(html).toContain("cx-seg--field");
    expect(html).not.toContain("Save Pays");
    expect(html.match(/class="cx-seg__item"/g)).toHaveLength(4);
  });

  it("keeps a typed value in the value column with its save button", () => {
    const html = row(lead, true);
    expect(html).toContain('class="cx-rf-row"');
    expect(html).toContain('aria-label="Save Lead time"');
  });

  it("draws the choice as a value until it is clicked", () => {
    expect(row(pays, false)).toContain('class="cx-rf-row"');
  });
});

describe("A supplier's Contacts tab", () => {
  const list = getReportDefinition("retail-supplier-contacts")!.list!;
  const name = list.columns.find((column) => column.key === "name")!;

  it("draws the name in 600 ink, not as a link", () => {
    const html = renderToStaticMarkup(<ListCell column={name} row={{ id: "c-1", name: "Tinashe Moyo" } as ReportRow} rowHref={null} />);
    expect(html).toBe('<span class="cx-lf-strong">Tinashe Moyo</span>');
  });
});
