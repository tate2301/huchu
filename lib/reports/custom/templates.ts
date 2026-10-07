import { checkBlocks, tablesRead } from "@/lib/reports/custom/run";
import type { BlockDisplay, CustomBlock, CustomDocument } from "@/lib/reports/custom/document";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { sourceTable, sqlName } from "@/lib/reports/sql/schema";
import type { BuiltInAudience } from "@/lib/reports/definitions/retail/templates";
import { canSeeTemplate } from "@/lib/reports/template-access";
import type { ReportDefinition } from "@/lib/reports/types";

/**
 * Built-in custom reports: pages of several blocks, SQL over the report
 * sources, for every kind of business the platform runs.
 *
 * They are built-in templates in the catalogue's sense
 * (`components/reports/report-catalog.tsx`): listed under "Built in", beside
 * every report the code ships and the templates a team saved, and offered by
 * audience the way `RETAIL_BUILT_INS` are. Opening one shows it on the
 * reader's own rows; "Make it yours" copies it into the workspace as a custom
 * report to change and share like any other.
 *
 * One is offered only to someone who can read every source it reads: a
 * school is never shown a mine's production report, and a clerk is never
 * shown one built on a report only managers open.
 */

export type CustomTemplate = {
  /** Its address: `/reports/built/{key}`. */
  key: string;
  title: string;
  description: string;
  /** Who it is offered to, as a built-in report template is. */
  audience: BuiltInAudience;
  /** The workspace profiles it is at the front of the catalogue for. */
  profiles: string[];
  document: CustomDocument;
};

type Query = { name: string; title?: string; query: string; display: BlockDisplay; half?: boolean };

let next = 0;
const heading = (text: string): CustomBlock => ({ id: `heading-${(next += 1)}`, type: "heading", text, level: 2 });
const note = (text: string): CustomBlock => ({ id: `text-${(next += 1)}`, type: "text", text });
const query = ({ name, title, query: sql, display, half }: Query): CustomBlock => ({
  id: `query-${(next += 1)}`,
  type: "query",
  name,
  ...(title ? { title } : {}),
  query: sql.endsWith("\n") ? sql : `${sql}\n`,
  display,
  ...(half ? { half } : {}),
});
const figures = { type: "figures" } as const;
const table = { type: "table" } as const;
const bars = (by: string, column: string, fn: "sum" | "avg" | "max" | "count" = "sum", limit?: number): BlockDisplay => ({
  type: "chart",
  form: "bars",
  by,
  measure: { column, fn },
  ...(limit ? { limit } : {}),
});
const trend = (by: string, column: string, fn: "sum" | "avg" | "max" = "sum"): BlockDisplay => ({ type: "chart", form: "trend", by, measure: { column, fn } });
/** A breakdown reads plain rows: it counts and totals them itself, so a query under one is not grouped. */
const breakdown = (by: string, limit?: number): BlockDisplay => ({ type: "breakdown", by, ...(limit ? { limit } : {}) });

const days = (from: `-${number}d` | "monthStart" | "yearStart"): CustomDocument["period"] => ({ from, to: "today" });

export const CUSTOM_TEMPLATES: readonly CustomTemplate[] = [
  /* ── Mining ──────────────────────────────────────────────────────────── */
  {
    key: "mine-production-week",
    audience: "EVERYONE",
    title: "Production, week by week",
    description: "Tonnes fed, gold and hours lost, by week and by site",
    profiles: ["GOLD_MINE"],
    document: {
      period: days("-90d"),
      blocks: [
        query({
          name: "totals",
          query: "select\n  sum(tonnes_fed) as tonnes_fed,\n  sum(gold) as gold,\n  sum(run_hours) as run_hours,\n  sum(downtime) as downtime\nfrom plant",
          display: figures,
        }),
        query({
          name: "gold_by_week",
          title: "Gold by week",
          query: "select\n  cast(date_trunc('week', date) as date) as week,\n  sum(gold) as gold\nfrom plant\ngroup by 1\norder by 1",
          display: trend("week", "gold"),
        }),
        query({
          name: "by_site",
          title: "By site",
          query: "select\n  site,\n  sum(tonnes_fed) as tonnes_fed,\n  sum(gold) as gold,\n  sum(downtime) as downtime\nfrom plant\ngroup by 1\norder by gold desc",
          display: table,
        }),
      ],
    },
  },
  {
    key: "mine-downtime",
    audience: "EVERYONE",
    title: "Where the hours go",
    description: "Downtime by cause, and the worst days",
    profiles: ["GOLD_MINE"],
    document: {
      period: days("-30d"),
      blocks: [
        query({
          name: "by_cause",
          title: "Hours down, by cause",
          query: "select cause, sum(hours) as hours, count(*) as stops\nfrom downtime\ngroup by 1\norder by hours desc",
          display: bars("cause", "hours"),
          half: true,
        }),
        query({
          name: "worst_days",
          title: "The worst days",
          query: "select date, site, sum(hours) as hours\nfrom downtime\ngroup by 1, 2\norder by hours desc\nlimit 10",
          display: table,
          half: true,
        }),
      ],
    },
  },
  {
    key: "mine-gold-to-cash",
    audience: "MANAGERS",
    title: "Gold, poured to paid",
    description: "Grams poured, where each bar is, and what has been paid",
    profiles: ["GOLD_MINE"],
    document: {
      period: days("-90d"),
      blocks: [
        query({
          name: "poured",
          query: "select count(*) as bars, sum(grams) as grams, sum(value) as value, sum(paid) as paid\nfrom gold_chain",
          display: figures,
        }),
        query({
          name: "by_stage",
          title: "Where the bars are",
          query: "select stage, grams\nfrom gold_chain",
          display: breakdown("stage"),
          half: true,
        }),
        query({
          name: "receipts",
          title: "Paid, by method",
          query: "select method, paid\nfrom gold_receipts",
          display: breakdown("method"),
          half: true,
        }),
      ],
    },
  },

  /* ── Schools ─────────────────────────────────────────────────────────── */
  {
    key: "school-fees-owed",
    audience: "MANAGERS",
    title: "Fees owed, by class",
    description: "What is billed, paid and still owed, and who owes the most",
    profiles: ["SCHOOLS"],
    document: {
      period: { from: null, to: null },
      blocks: [
        query({
          name: "totals",
          query: "select sum(total) as billed, sum(paid) as paid, sum(balance) as owed\nfrom school_fee_balances",
          display: figures,
        }),
        query({
          name: "by_class",
          title: "Owed by class",
          query: "select class, sum(balance) as owed, count(*) as invoices\nfrom school_fee_balances\nwhere balance > 0\ngroup by 1\norder by owed desc",
          display: bars("class", "owed"),
        }),
        query({
          name: "longest_overdue",
          title: "Longest overdue",
          query: "select student, class, term, days_overdue, balance\nfrom school_fee_balances\nwhere balance > 0\norder by days_overdue desc\nlimit 20",
          display: table,
        }),
      ],
    },
  },
  {
    key: "school-fees-collected",
    audience: "MANAGERS",
    title: "Fees collected",
    description: "Receipts by week and by how they were paid",
    profiles: ["SCHOOLS"],
    document: {
      period: days("monthStart"),
      blocks: [
        query({
          name: "by_week",
          title: "Collected by week",
          query: "select\n  cast(date_trunc('week', date) as date) as week,\n  sum(amount) as collected\nfrom school_fee_receipts\ngroup by 1\norder by 1",
          display: trend("week", "collected"),
        }),
        query({
          name: "by_method",
          title: "By method",
          query: "select method, amount\nfrom school_fee_receipts",
          display: breakdown("method"),
        }),
      ],
    },
  },
  {
    key: "school-attendance",
    audience: "EVERYONE",
    title: "Attendance by class",
    description: "How each class was marked, day by day",
    profiles: ["SCHOOLS"],
    document: {
      period: days("-30d"),
      blocks: [
        query({
          name: "marks",
          title: "How pupils were marked",
          query: "select status, class\nfrom school_attendance",
          display: breakdown("status"),
          half: true,
        }),
        query({
          name: "by_class",
          title: "By class",
          query: "select class, status, count(*) as marks\nfrom school_attendance\ngroup by 1, 2\norder by class",
          display: table,
          half: true,
        }),
      ],
    },
  },

  /* ── Retail ──────────────────────────────────────────────────────────── */
  {
    key: "retail-takings",
    audience: "EVERYONE",
    title: "Takings and margin",
    description: "What sold by day, the items that earn the most, and how it was paid",
    profiles: ["RETAIL"],
    document: {
      period: days("-30d"),
      blocks: [
        query({
          name: "totals",
          query: "select sum(quantity) as items, sum(revenue) as revenue, sum(margin) as margin\nfrom retail_items_sold",
          display: figures,
        }),
        query({
          name: "by_day",
          title: "Revenue by day",
          query: "select date, sum(revenue) as revenue\nfrom retail_items_sold\ngroup by 1\norder by 1",
          display: trend("date", "revenue"),
        }),
        query({
          name: "best_items",
          title: "What earns the most",
          query: "select item, sum(quantity) as sold, sum(revenue) as revenue, sum(margin) as margin\nfrom retail_items_sold\ngroup by 1\norder by margin desc\nlimit 15",
          display: table,
          half: true,
        }),
        query({
          name: "by_tender",
          title: "How it was paid",
          query: "select tender, amount\nfrom retail_payments",
          display: breakdown("tender"),
          half: true,
        }),
      ],
    },
  },
  {
    key: "retail-till-variances",
    audience: "MANAGERS",
    title: "Till variances",
    description: "Takings and variance by cashier, and the shifts that did not balance",
    profiles: ["RETAIL"],
    document: {
      period: { from: null, to: null },
      blocks: [
        query({
          name: "by_cashier",
          title: "Variance by cashier",
          query: "select cashier, count(*) as shifts, sum(takings) as takings, sum(variance) as variance\nfrom retail_shifts\ngroup by 1\norder by variance",
          display: bars("cashier", "variance"),
        }),
        query({
          name: "shifts",
          title: "Shifts that did not balance",
          query: "select shift_no, cashier, till, opened_at, takings, variance\nfrom retail_shifts\nwhere variance <> 0\norder by opened_at desc",
          display: table,
        }),
      ],
    },
  },
  {
    key: "retail-reorder",
    audience: "EVERYONE",
    title: "Stock to reorder",
    description: "Products at or under their reorder level, and what stock is worth",
    profiles: ["RETAIL"],
    document: {
      period: { from: null, to: null },
      blocks: [
        query({ name: "worth", query: "select count(*) as products, sum(value) as value\nfrom retail_stock_on_hand", display: figures }),
        query({
          name: "reorder",
          title: "At or under the reorder level",
          query: "select product, code, site, on_hand, reorder_at\nfrom retail_stock_on_hand\nwhere on_hand <= reorder_at\norder by on_hand",
          display: table,
        }),
      ],
    },
  },

  /* ── Sales and delivery ──────────────────────────────────────────────── */
  {
    key: "crm-pipeline",
    audience: "EVERYONE",
    title: "Pipeline by owner",
    description: "Open, won and lost value, by who owns the deal",
    profiles: ["GENERAL"],
    document: {
      period: days("yearStart"),
      blocks: [
        query({
          name: "totals",
          query: "select\n  count(*) as deals,\n  sum(value) filter (where status = 'Open') as open_value,\n  sum(value) filter (where status = 'Won') as won_value\nfrom crm_deals",
          display: figures,
        }),
        query({
          name: "by_owner",
          title: "By owner",
          query: "select\n  owner,\n  sum(value) filter (where status = 'Open') as open_value,\n  sum(value) filter (where status = 'Won') as won_value,\n  count(*) filter (where status = 'Lost') as lost\nfrom crm_deals\ngroup by 1\norder by won_value desc nulls last",
          display: table,
        }),
      ],
    },
  },
  {
    key: "crm-measured-to-won",
    audience: "EVERYONE",
    title: "Measured to won",
    description: "Square metres measured on site, quoted and won, by month and by rep",
    profiles: ["GENERAL"],
    document: {
      period: days("-180d"),
      blocks: [
        query({
          name: "by_month",
          title: "By month",
          query: "select\n  cast(date_trunc('month', visited) as date) as month,\n  sum(measured) as measured,\n  sum(drafted) as quoted\nfrom crm_visit_forms\ngroup by 1\norder by 1",
          display: bars("month", "measured"),
        }),
        query({
          name: "by_rep",
          title: "By rep",
          query: "select\n  rep,\n  count(*) as visits,\n  sum(measured) as measured,\n  sum(drafted) as quoted,\n  count(*) filter (where outcome = 'Won') as won\nfrom crm_visit_forms\ngroup by 1\norder by measured desc",
          display: table,
        }),
      ],
    },
  },
  {
    key: "crm-money-owed",
    audience: "MANAGERS",
    title: "Money owed",
    description: "Invoice balances, by customer",
    profiles: ["GENERAL"],
    document: {
      period: { from: null, to: null },
      blocks: [
        query({ name: "owed", query: "select sum(total) as invoiced, sum(paid) as paid, sum(balance) as owed\nfrom crm_invoices", display: figures }),
        query({
          name: "by_customer",
          title: "By customer",
          query: "select customer, count(*) as invoices, sum(balance) as owed\nfrom crm_invoices\nwhere balance > 0\ngroup by 1\norder by owed desc",
          display: table,
        }),
      ],
    },
  },

  /* ── Every business: people, pay and stores ─────────────────────────── */
  {
    key: "pay-by-department",
    audience: "MANAGERS",
    title: "Pay by department",
    description: "Gross, deductions, net and what employing people costs",
    profiles: ["PAYROLL"],
    document: {
      period: days("-90d"),
      blocks: [
        query({
          name: "totals",
          query: "select sum(gross) as gross, sum(deductions) as deductions, sum(net) as net, sum(employer_cost) as employer_cost\nfrom payroll_pay",
          display: figures,
        }),
        query({
          name: "by_department",
          title: "By department",
          query: "select department, count(distinct employee_no) as people, sum(net) as net, sum(employer_cost) as employer_cost\nfrom payroll_pay\ngroup by 1\norder by employer_cost desc",
          display: bars("department", "employer_cost"),
        }),
      ],
    },
  },
  {
    key: "people-leave",
    audience: "EVERYONE",
    title: "Leave taken",
    description: "Days off by type, and who has taken the most",
    profiles: ["PAYROLL"],
    document: {
      period: days("yearStart"),
      blocks: [
        query({
          name: "by_type",
          title: "By type",
          query: "select type, days\nfrom people_leave",
          display: breakdown("type"),
          half: true,
        }),
        query({
          name: "by_person",
          title: "Most days off",
          query: "select employee, sum(days) as days, count(*) as requests\nfrom people_leave\ngroup by 1\norder by days desc\nlimit 15",
          display: table,
          half: true,
        }),
      ],
    },
  },
  {
    key: "stores-issues",
    audience: "EVERYONE",
    title: "What the stores issue",
    description: "Items issued most, and who they go to",
    profiles: ["GOLD_MINE"],
    document: {
      period: days("-30d"),
      blocks: [
        note("Issues out of the stores, by item and by whoever they were issued to."),
        heading("By item"),
        query({
          name: "by_item",
          query: "select item, unit, sum(quantity) as quantity\nfrom stores_movements\nwhere type = 'Issue'\ngroup by 1, 2\norder by quantity desc\nlimit 20",
          display: table,
        }),
        query({
          name: "by_person",
          title: "By who they went to",
          query: "select issued_to, quantity\nfrom stores_movements\nwhere type = 'Issue'",
          display: breakdown("issued_to", 10),
        }),
      ],
    },
  },
];

/** Which source keys each template reads, worked out from its own SQL. */
let reads: Map<string, string[]> | null = null;

export function templateReads(): Map<string, string[]> {
  if (reads) return reads;
  const tables = REPORT_DEFINITIONS.map((definition) => sourceTable(definition));
  const keyOf = new Map(REPORT_DEFINITIONS.map((definition) => [sqlName(definition.key), definition.key]));
  reads = new Map(
    CUSTOM_TEMPLATES.map((template) => {
      const checks = checkBlocks(template.document.blocks, tables);
      return [template.key, tablesRead(checks, tables).map((name) => keyOf.get(name) ?? name)];
    }),
  );
  return reads;
}

/**
 * The built-in custom reports someone is offered: its audience includes them,
 * and every source it reads is one they can open. Their own business's first.
 */
export function templatesFor(
  readable: readonly Pick<ReportDefinition, "key">[],
  person: { id: string; role: string },
  profile: string | null | undefined,
): CustomTemplate[] {
  const open = new Set(readable.map((definition) => definition.key));
  const needs = templateReads();
  const usable = CUSTOM_TEMPLATES.filter((template) => {
    const sources = needs.get(template.key) ?? [];
    return canSeeTemplate({ audience: template.audience, createdById: null }, person) && sources.length > 0 && sources.every((key) => open.has(key));
  });
  const ours = (template: CustomTemplate) => (profile ? template.profiles.includes(profile) : false);
  return [...usable.filter(ours), ...usable.filter((template) => !ours(template))];
}

export function customTemplate(key: string): CustomTemplate | null {
  return CUSTOM_TEMPLATES.find((template) => template.key === key) ?? null;
}
