import type { CustomReportInput, QueryBlock } from "@/lib/reports/custom/document";
import type { BlockResult } from "@/lib/reports/custom/run";
import type { SqlTable } from "@/lib/reports/sql/schema";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";
import type { ReportSuggestion } from "@/lib/vane/status";

/**
 * Floorcode's Monday board as ReportBuild and ReportBuildVane draw it: the
 * site visits it reads, its three questions, and the question Vane wrote,
 * with the rows each returns. Fixed, so the fixture compares like with like.
 */

const col = (key: string, label: string, kind: ReportColumn["kind"]): ReportColumn & { sql: string } => ({ key, sql: key, label, kind });

export const FIXTURE_TABLES: SqlTable[] = [
  {
    name: "site_visits",
    title: "Site visits",
    columns: [
      col("visited_on", "Visited", "date"),
      col("customer", "Customer", "text"),
      col("fitter", "Fitter", "text"),
      col("area_m2", "Area", "number"),
      col("subfloor", "Subfloor", "text"),
      col("total", "Quote", "money"),
      col("state", "State", "status"),
      col("accepted", "Accepted", "number"),
      col("accepted_total", "Accepted total", "money"),
    ],
  },
];

export const FIXTURE_REPORT: CustomReportInput = {
  title: "Monday board",
  description: null,
  audience: "EVERYONE",
  document: {
    period: { from: "-90d", to: "today" },
    blocks: [
      {
        id: "sentence-1",
        type: "sentence",
        from: "totals",
        fact: "{visits} site visits drafted {quotes} quotes.",
        rest: "{accepted} were accepted, {accepted_total} of {quoted} quoted.",
      },
      {
        id: "controls-1",
        type: "controls",
        dates: true,
        filters: [
          { column: "fitter", label: "fitter" },
          { column: "subfloor", label: "subfloor" },
        ],
      },
      {
        id: "query-1",
        type: "query",
        name: "by_subfloor",
        title: "Accepted, by subfloor",
        query: "select subfloor, sum(accepted) as accepted\nfrom site_visits\ngroup by subfloor\norder by accepted desc\n",
        display: { type: "chart", form: "bars", by: "subfloor", measure: { column: "accepted", fn: "sum" } },
        half: true,
      },
      {
        id: "query-2",
        type: "query",
        name: "totals",
        title: "Average quote",
        query:
          "select\n  avg(total) as average_quote,\n  count(*) as visits,\n  count(total) as quotes,\n  sum(accepted) as accepted,\n  sum(accepted_total) as accepted_total,\n  sum(total) as quoted\nfrom site_visits\n",
        display: { type: "figures" },
        half: true,
      },
      {
        id: "query-3",
        type: "query",
        name: "visits",
        title: "Visits",
        query: "select visited_on, customer, fitter, area_m2, total, state\nfrom site_visits\norder by visited_on desc\n",
        display: { type: "table" },
      },
    ],
  },
};

const visit = (id: string, visited_on: string, customer: string, fitter: string, area_m2: number, total: number, state: string): ReportRow => ({
  id,
  visited_on,
  customer,
  fitter,
  area_m2,
  total,
  state,
});

export const FIXTURE_SUGGESTION: ReportSuggestion = {
  id: "vane-by-fitter",
  name: "by fitter",
  note: "You narrow this board by fitter every Monday. I wrote the question; let's keep it and add it as a table.",
  sql: "select fitter, count(*) as visits, sum(accepted) as accepted, sum(accepted_total) as accepted_total\nfrom site_visits\ngroup by fitter\norder by accepted_total desc\n",
};

export const FIXTURE_SUGGESTION_BLOCK: QueryBlock = {
  id: "vane-suggestion",
  type: "query",
  name: "by_fitter",
  query: FIXTURE_SUGGESTION.sql,
  display: { type: "table" },
};

export const FIXTURE_RESULTS = new Map<string, BlockResult>([
  [
    "query-1",
    {
      ok: true,
      truncated: false,
      columns: [col("subfloor", "Subfloor", "text"), col("accepted", "Accepted", "number")],
      rows: [
        { id: "s1", subfloor: "Concrete", accepted: 24 },
        { id: "s2", subfloor: "Timber boards", accepted: 12 },
        { id: "s3", subfloor: "Existing tiles", accepted: 5 },
        { id: "s4", subfloor: "Not recorded", accepted: 1 },
      ],
    },
  ],
  [
    "query-2",
    {
      ok: true,
      truncated: false,
      columns: [
        col("average_quote", "Average quote", "money"),
        col("visits", "Visits", "number"),
        col("quotes", "Quotes", "number"),
        col("accepted", "Accepted", "number"),
        col("accepted_total", "Accepted total", "money"),
        col("quoted", "Quoted", "money"),
      ],
      rows: [{ id: "t1", average_quote: 862.54, visits: 86, quotes: 71, accepted: 42, accepted_total: 38915, quoted: 61240 }],
    },
  ],
  [
    "query-3",
    {
      ok: true,
      truncated: false,
      columns: [
        col("visited_on", "Visited", "date"),
        col("customer", "Customer", "text"),
        col("fitter", "Fitter", "text"),
        col("area_m2", "Area", "number"),
        col("total", "Quote", "money"),
        col("state", "State", "status"),
      ],
      rows: [
        visit("v1", "2026-10-06", "Mrs Chari", "Tinashe", 27.92, 1041.26, "Sent"),
        visit("v2", "2026-10-06", "Pomona Offices", "Kuda", 212.4, 8930, "Drafted"),
        visit("v3", "2026-10-05", "Dr N. Sibanda", "Farai", 48.1, 2114.5, "Accepted"),
        visit("v4", "2026-10-05", "Msasa Motors", "Tinashe", 96, 3480, "Sent"),
        visit("v5", "2026-10-03", "Mr and Mrs Chari", "Kuda", 31.6, 1296.4, "Accepted"),
        visit("v6", "2026-10-02", "Highlands Guest Lodge", "Farai", 164.2, 6720, "Accepted"),
      ],
    },
  ],
  [
    "vane-suggestion",
    {
      ok: true,
      truncated: false,
      columns: [col("fitter", "Fitter", "text"), col("visits", "Visits", "number"), col("accepted", "Accepted", "number"), col("accepted_total", "Accepted total", "money")],
      rows: [
        { id: "f1", fitter: "Kuda", visits: 29, accepted: 14, accepted_total: 13205.4 },
        { id: "f2", fitter: "Farai", visits: 26, accepted: 13, accepted_total: 12869.6 },
        { id: "f3", fitter: "Tinashe", visits: 31, accepted: 15, accepted_total: 12840 },
      ],
    },
  ],
]);
