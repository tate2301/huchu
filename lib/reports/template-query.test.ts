/**
 * A template's query both ways: what a built-in is written in and what a saved
 * template keeps (its view and params). Rollup keys and the order of the
 * columns survive the trip; a template lies under the address, which wins.
 */
import { describe, expect, it } from "vitest";

import { REPORT_ONLY_REPORTS } from "@/lib/reports/definitions/retail/reports";
import { builtInTemplate } from "@/lib/reports/definitions/retail/templates";

import { listShape, resolveListQuery } from "./list-query";
import { fromTemplateQuery, layTemplate, toTemplateQuery } from "./template-query";

const PAYMENTS = REPORT_ONLY_REPORTS.find((report) => report.key === "retail-payments")!.report!;

describe("template queries", () => {
  it("round-trips Takings by payment with its rows and its column order", () => {
    const query = builtInTemplate("takings-by-payment")!.query;
    const { view, params } = fromTemplateQuery(query, PAYMENTS);
    expect(view.rows).toEqual(["day", "till"]);
    expect(view.columns.filter((column) => !column.hidden).map((column) => column.key)).toEqual(query.cols);
    expect(view.groupBy).toBe("day");
    expect(view.sort).toEqual(PAYMENTS.sorts[0]!.rules);
    expect(params).toEqual({ when: "this-month" });

    const back = toTemplateQuery(view, params);
    expect(back.rows).toEqual(["day", "till"]);
    expect(back.cols).toEqual(query.cols);
    expect(back.filters).toEqual({ when: "this-month" });
    // Written out as rules, it reads back as the same view.
    expect(fromTemplateQuery(back, PAYMENTS).view).toEqual(view);
  });

  it("keeps a column order that is not the face's, and drops columns the shape has not got", () => {
    const { view } = fromTemplateQuery({ filters: {}, cols: ["amount", "tender", "when", "nope"], sort: "biggest" }, PAYMENTS);
    expect(view.columns.slice(0, 3)).toEqual([
      { key: "amount", hidden: false },
      { key: "tender", hidden: false },
      { key: "when", hidden: false },
    ]);
    expect(view.columns.some((column) => column.key === "nope")).toBe(false);
    expect(view.columns.some((column) => column.key === "payments")).toBe(false);
    expect(toTemplateQuery(view, {}).cols).toEqual(["amount", "tender", "when"]);
  });

  it("lies under the address: what the address says wins", () => {
    const template = builtInTemplate("takings-by-payment")!.query;
    const laid = layTemplate(template, { page: 1, size: 50, filters: { when: "last-weekend" }, rows: ["site"] }, PAYMENTS);
    expect(laid).toMatchObject({ face: "report", filters: { when: "last-weekend" }, rows: ["site"], sort: "newest", group: "day" });
    // The template's columns belong to its own rows, so the rolled table keeps its own keys.
    expect(laid.cols).toBeUndefined();
    expect(layTemplate(template, { page: 1, size: 50, filters: {}, rows: ["day", "till"] }, PAYMENTS).cols).toEqual(template.cols);
    expect(layTemplate(template, { page: 1, size: 50, filters: {}, rows: ["site"], cols: ["site", "taken"] }, PAYMENTS).cols).toEqual(["site", "taken"]);
  });

  it("rolls Items sold by item and category with the keys and the count shown", () => {
    const items = REPORT_ONLY_REPORTS.find((report) => report.key === "retail-items-sold")!.report!;
    const template = builtInTemplate("items-sold")!.query;
    const asked = layTemplate(template, { page: 1, size: 50, filters: {}, rows: ["item", "category"] }, items);
    const resolved = resolveListQuery(items, asked, {}, { role: "SUPERADMIN", seeCost: true });
    const shape = listShape(items, resolved);
    const shown = shape.columns.filter((column) => !resolved.hidden.includes(column.key)).map((column) => column.key);
    expect(shown.slice(0, 3)).toEqual(["item", "category", "lines"]);
  });
});
