import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListCell } from "@/components/list-frame/list-cell";
import { getReportDefinition } from "@/lib/reports/registry";
import type { ReportRow } from "@/lib/reports/types";
import type { SaleView } from "@/lib/retail/floor/sale-view";
import { saleKind } from "@/lib/retail/record-kinds";
import type { Grant, RailRow } from "@/lib/retail/record-kinds/types";
import { cutWords } from "@/components/list-frame/actions";

import { ChartPanel } from "./chart-panel";
import { DetailRow } from "./detail-row";
import { DetailsRail } from "./details-rail";

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

/** A sale as `GET /sales/[id]` gives it, with only what the rail and actions read. */
function saleOf(over: Partial<SaleView> = {}): SaleView {
  return {
    id: "sale-1",
    saleNo: "SALE-31866",
    saleType: "SALE",
    till: { id: "t", name: "Front till" },
    cashier: { id: "c", name: "Chipo Dube" },
    customer: null,
    customerName: null,
    priceList: "Retail",
    payments: [{ id: "p", tender: "CARD", label: "Card", reference: "CBZ 4412 0988", currency: "USD", amount: "44.20", baseAmount: "44.20" }],
    change: "0.00",
    deposit: "0.00",
    fiscal: { state: "SIGNED", receipt: "FDMS 0441-2209 / 31866", dayNo: 214, signedAt: null, error: null },
    idCheckedAt: "2026-10-03T09:39:00.000Z",
    refund: null,
    void: null,
    source: null,
    can: { refund: false, void: false, voidableToday: false, update: true, send: true },
    ...over,
  } as unknown as SaleView;
}

const rail = (sale: SaleView, grants: string[]) =>
  renderToStaticMarkup(
    <DetailsRail
      top={null}
      groups={saleKind.rail(sale)}
      can={(grant: Grant) => grants.includes(grant.join(":"))}
      locked={false}
      onSave={async () => {}}
    />,
  );

describe("A sale's rail (SaleRecord board)", () => {
  it("puts the hint on Sale, beside Till and Customer, for someone who may change a reference", () => {
    const html = rail(saleOf(), ["retail.sell:update"]);
    expect(html.match(/click any value to change it/g)).toHaveLength(1);
    expect(html).toMatch(/Sale<span class="cx-rf-group__hint">click any value to change it/);
  });

  it("has no hint for a role that may change nothing", () => {
    expect(rail(saleOf({ can: { refund: false, void: false, voidableToday: false, update: false, send: true } }), [])).not.toContain(
      "click any value",
    );
  });

  it("keeps ID checked under Fiscal when the sale has no fiscal receipt, and dates a void short", () => {
    const html = rail(
      saleOf({
        fiscal: { state: "OFF", receipt: null, dayNo: null, signedAt: null, error: null },
        idCheckedAt: null,
        void: { reason: "Rang up wrong", approvedBy: "Tafara Nyathi", at: "2026-10-07T05:43:00.000Z" },
      }),
      [],
    );
    expect(html).toMatch(/Fiscal<\/h3>.*ID checked/);
    expect(html).not.toMatch(/>ID<\/h3>/);
    expect(html).not.toContain("Not signed yet");
    expect(html).toContain("7 Oct 07:43");
    expect(html).not.toContain("October");
  });
});

describe("A sale's receipt copy", () => {
  it("is printed by a POST, from the header and from View the receipt", () => {
    const sale = saleOf();
    const reprint = saleKind.actions!(sale).find((action) => action.key === "reprint");
    expect(reprint?.do).toEqual({ print: "/api/v2/retail/sales/sale-1/receipt" });
    const lines = saleKind.tabs.find((tab) => tab.key === "lines");
    expect(lines && "allLink" in lines ? lines.allLink : null).toEqual({ label: "View the receipt", action: "reprint" });
  });
});

describe("Export toast when the file stops at the row limit", () => {
  it("says how many rows the file has and how many the list found", () => {
    expect(cutWords("5000", "5858")).toEqual({ title: "The file has the first 5,000 of 5,858 rows. Narrow the filters for the rest.", variant: "warning" });
    expect(cutWords("5000", null)?.title).toBe("The file has the first 5,000 rows. Narrow the filters for the rest.");
    expect(cutWords(null, null)).toBeNull();
  });
});

