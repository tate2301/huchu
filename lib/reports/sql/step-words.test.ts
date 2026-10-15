import { describe, expect, it } from "vitest";

import type { SqlTable } from "./schema";
import { stepSentences } from "./step-words";

const visits: SqlTable = {
  name: "crm_visit_forms",
  title: "Site visit forms",
  columns: [
    { key: "visited", sql: "visited", label: "Visited", kind: "date" },
    { key: "rep", sql: "rep", label: "Rep", kind: "text" },
    { key: "outcome", sql: "outcome", label: "Outcome", kind: "status" },
    { key: "drafted", sql: "drafted", label: "Drafted", kind: "money" },
  ],
};

describe("stepSentences", () => {
  it("reads a query's steps out, one sentence each", () => {
    expect(
      stepSentences(
        {
          from: "crm_visit_forms",
          keep: [{ column: "outcome", op: "is", value: "Won" }],
          groups: [{ column: "rep" }],
          totals: [
            { fn: "count", as: "visits" },
            { fn: "sum", column: "drafted", as: "accepted_total" },
          ],
          columns: [],
          sort: { column: "accepted_total", dir: "desc" },
        },
        [visits],
      ),
    ).toEqual([
      "Start from Site visit forms",
      "Keep where outcome is Won",
      "Group by rep",
      "Count the rows as visits",
      "Add up drafted as accepted total",
      "Sort by accepted total, highest first",
    ]);
  });

  it("says newest first for a date, and names the columns shown", () => {
    expect(
      stepSentences({ from: "crm_visit_forms", keep: [], groups: [], totals: [], columns: ["visited", "rep"], sort: { column: "visited", dir: "desc" } }, [visits]),
    ).toEqual(["Start from Site visit forms", "Show visited, rep", "Sort newest first"]);
  });
});
