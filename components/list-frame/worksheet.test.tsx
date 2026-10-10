import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getReportDefinition } from "@/lib/reports/registry";
import type { ReportRow } from "@/lib/reports/types";

import { ListCell } from "./list-cell";
import { fillFromFilters, leaveAsk, typedNumber, typedRow, UNSAVED } from "./model";
import { SaveBar } from "./save-bar";

/**
 * The worksheet's typing (PRD-07, `PricesList.png`): the margin and its pill
 * follow the typed price, the changed cell reads "Not saved", the save bar
 * counts the changes, and leaving asks first.
 */

const spec = getReportDefinition("retail-prices")!.list!;
const edit = spec.edit!;
const margin = spec.columns.find((column) => column.key === "margin")!;
const amarula: ReportRow = {
  id: "p-amarula",
  name: "Amarula Cream 750ml",
  cost: 13.03,
  price: 18.25,
  margin: 28.6,
  marginTone: null,
  targetMargin: 25,
  changed: "3 October 2026",
};

describe("typing a price on the worksheet", () => {
  it("works the margin and its pill out again from the typed price", () => {
    const typed = typedRow(amarula, "18.99", spec.columns, edit);
    expect(typed).toMatchObject({ price: 18.99, margin: 31.4, marginTone: null, changed: UNSAVED });
    // Under target by less than five points: warn; more, or under cost: bad.
    expect(typedRow(amarula, "17.00", spec.columns, edit)).toMatchObject({ margin: 23.4, marginTone: "warn" });
    expect(typedRow(amarula, "16.00", spec.columns, edit)).toMatchObject({ margin: 18.6, marginTone: "bad" });
    expect(typedRow(amarula, "12.00", spec.columns, edit)).toMatchObject({ marginTone: "bad" });
    expect(renderToStaticMarkup(<ListCell column={margin} row={typedRow(amarula, "17.00", spec.columns, edit)} />)).toBe(
      '<span class="cx-lf-pill cx-lf-pill--warn">23.4%</span>',
    );
  });

  it("leaves a row nobody typed in as it was, and a figure that is not one unworked", () => {
    expect(typedRow(amarula, undefined, spec.columns, edit)).toBe(amarula);
    expect(typedRow(amarula, "18.", spec.columns, edit)).toMatchObject({ price: 18.25, margin: 28.6, changed: UNSAVED });
    expect(typedNumber("US$ 18.99")).toBe(18.99);
    // What the server refuses is not worked out here either.
    expect([typedNumber("18,99"), typedNumber("1e3"), typedNumber("1.234"), typedNumber("99999999999")]).toEqual([null, null, null, null]);
  });

  it("saves to the list the worksheet is scoped to", () => {
    expect(fillFromFilters(edit.endpoint, { list: "l-retail" })).toBe("/api/v2/retail/price-lists/l-retail/prices");
    expect(fillFromFilters(edit.endpoint, {})).toBeNull();
  });

  it("counts the changes on the save bar", () => {
    const html = renderToStaticMarkup(
      <SaveBar count={3} changedLabel={edit.changedLabel} note={edit.note} save={edit.save} saving={false} onDiscard={() => {}} onSave={() => {}} />,
    );
    expect(html).toContain('<span class="mono">3</span> prices changed');
    expect(html).toContain("The till picks them up the moment you save. Margins update as you type.");
    expect(html).toContain("Save prices");
  });

  it("asks before leaving with changes not saved", () => {
    expect(leaveAsk(3, "Retail")).toEqual({
      title: "Leave without saving?",
      body: "3 changes on Retail are not saved.",
      keep: "Keep editing",
      go: "Discard changes",
      fill: "bad",
    });
    expect(leaveAsk(1, "Retail").body).toBe("1 change on Retail is not saved.");
  });
});
