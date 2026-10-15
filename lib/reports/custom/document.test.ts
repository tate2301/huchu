import { describe, expect, it } from "vitest";

import { controlsOf, controlsWords, customDocumentSchema, fillSentence, filterParam, narrowRows, sentenceHoles } from "./document";

const query = { id: "query-1", type: "query", name: "totals", query: "select count(*) as visits\nfrom crm_visit_forms\n", display: { type: "figures" } } as const;

describe("the sentence and controls blocks (ReportMonday, ReportBuild)", () => {
  it("keeps a sentence over a question and the report's controls in the document", () => {
    const parsed = customDocumentSchema.safeParse({
      period: { from: "-180d", to: "today" },
      blocks: [
        { id: "sentence-1", type: "sentence", from: "totals", fact: "{visits} site visits.", rest: "{accepted} were accepted." },
        { id: "controls-1", type: "controls", dates: true, filters: [{ column: "rep", label: "fitter" }] },
        query,
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && controlsOf(parsed.data)?.filters).toEqual([{ column: "rep", label: "fitter" }]);
  });

  it("refuses a second set of controls and a filter on a column that is not a SQL name", () => {
    const controls = { id: "controls-1", type: "controls", dates: true, filters: [] };
    expect(customDocumentSchema.safeParse({ period: { from: null, to: null }, blocks: [controls, { ...controls, id: "controls-2" }] }).success).toBe(false);
    expect(
      customDocumentSchema.safeParse({ period: { from: null, to: null }, blocks: [{ ...controls, filters: [{ column: "rep; drop", label: "fitter" }] }] }).success,
    ).toBe(false);
  });

  it("fills a sentence's holes from a row, and says a missing one as a dash", () => {
    expect(sentenceHoles("{visits} site visits drafted {quotes} quotes.")).toEqual(["visits", "quotes"]);
    const row: Record<string, string> = { visits: "86", quotes: "71" };
    expect(fillSentence("{visits} site visits drafted {quotes} quotes.", (column) => row[column] ?? null)).toBe("86 site visits drafted 71 quotes.");
    expect(fillSentence("{accepted} were accepted.", () => null)).toBe("— were accepted.");
  });

  it("names the controls by what they hold", () => {
    expect(controlsWords({ dates: true, filters: [{ column: "rep", label: "fitter" }, { column: "subfloor", label: "subfloor" }] })).toBe("Dates, fitter, subfloor");
    expect(controlsWords({ dates: false, filters: [{ column: "rep", label: "Fitter" }] })).toBe("Fitter");
    expect(controlsWords({ dates: false, filters: [] })).toBe("Controls");
    expect(filterParam({ column: "rep" })).toBe("f.rep");
  });

  it("narrows a source's rows by the filters it has a column for, and leaves the others alone", () => {
    const rows = [
      { id: "1", rep: "Tinashe", form: "Floors" },
      { id: "2", rep: "Kuda", form: "Floors" },
      { id: "3", rep: "Tinashe", form: "Walls" },
    ];
    const keyOf = (column: string) => (column === "rep" ? "rep" : column === "form" ? "form" : null);
    expect(narrowRows(rows, { rep: "Tinashe" }, keyOf).map((row) => row.id)).toEqual(["1", "3"]);
    expect(narrowRows(rows, { rep: "Tinashe", form: "Walls" }, keyOf).map((row) => row.id)).toEqual(["3"]);
    // A source without the column is not narrowed by it.
    expect(narrowRows(rows, { subfloor: "Concrete" }, keyOf)).toBe(rows);
  });
});
