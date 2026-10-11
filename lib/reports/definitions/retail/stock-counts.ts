import type { ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";
import { COUNT_STATE } from "@/lib/retail/stock/count-words";

/**
 * Counts (30-stock 5.5, W-22; board CountsList): every stock count, what it
 * covers, who counts it and how far it differs. Opens on "To approve"; "Done"
 * is the approved and the cancelled. Difference is at cost, so it is dropped
 * for roles that may not see cost; it and Differ stay empty while counting.
 */

const VIEW: ListGrant[] = [["retail.counts", "view"]];
const CREATE: ListGrant[] = [["retail.counts", "create"]];
const APPROVE: ListGrant[] = [["retail.counts", "approve"]];
const CANCEL: ListGrant[] = [["retail.counts", "delete"]];
const OPEN = [{ column: "status", op: "is" as const, value: ["COUNTING", "TO_APPROVE"] }];
const status = (...values: string[]) => [{ column: "status", op: "is" as const, value: values }];
const PRINT = { download: "/api/v2/retail/stock/counts/print", open: true } as const;
const state = (key: keyof typeof COUNT_STATE) => ({
  value: COUNT_STATE[key].label,
  label: COUNT_STATE[key].label,
  where: status(key),
});

const counts: ListSpec = {
  noun: "counts",
  read: VIEW,
  search: { placeholder: "Count or shelf", keys: ["countNo", "name"] },
  tabs: [
    { key: "toapprove", label: "To approve", where: status("TO_APPROVE") },
    { key: "counting", label: "Counting", where: status("COUNTING") },
    { key: "done", label: "Done", where: status("APPROVED", "CANCELLED") },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    {
      key: "site",
      label: "Site",
      type: "choice",
      any: "All sites",
      primary: true,
      optionsFromLoader: true,
      column: "siteId",
      requires: "multi-site",
    },
    {
      key: "state",
      label: "State",
      type: "choice",
      any: "Any",
      primary: true,
      options: [state("COUNTING"), state("TO_APPROVE"), state("APPROVED"), state("CANCELLED")],
    },
    { key: "counter", label: "Counted by", type: "choice", any: "Anyone", optionsFromLoader: true, column: "counterId" },
  ],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "createdAt", dir: "desc" },
        { column: "countNo", dir: "desc" },
      ],
    },
    {
      key: "oldest",
      label: "Oldest first",
      rules: [
        { column: "createdAt", dir: "asc" },
        { column: "countNo", dir: "asc" },
      ],
    },
    {
      key: "biggest",
      label: "Biggest difference",
      rules: [
        { column: "size", dir: "desc" },
        { column: "createdAt", dir: "desc" },
      ],
    },
  ],
  groups: ["state", "site", "counter"],
  columns: [
    {
      key: "countNo",
      label: "Count",
      kind: "code",
      cell: "ref",
      href: "/retail/stock/counts/{id}",
      width: "110px",
      align: "start",
      priority: 1,
    },
    { key: "name", label: "What", kind: "text", cell: "text", width: "minmax(180px,1.3fr)", align: "start", priority: 1 },
    { key: "counter", label: "Counted by", kind: "text", cell: "muted", width: "150px", align: "start", priority: 2 },
    { key: "when", label: "When", kind: "text", cell: "text", width: "140px", align: "start", priority: 2 },
    { key: "lines", label: "Lines", kind: "text", cell: "mono", width: "90px", align: "end", priority: 2 },
    // Blank while counting: nothing differs until it is sent.
    { key: "differ", label: "Differ", kind: "number", cell: "num", total: "sum", empty: "blank", width: "90px", align: "end", priority: 2 },
    {
      key: "difference",
      label: "Difference",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      empty: "dash",
      requires: "view-cost",
      width: "130px",
      align: "end",
      priority: 1,
    },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      tones: Object.fromEntries(Object.values(COUNT_STATE).map((entry) => [entry.label, entry.tone])),
      width: "150px",
      align: "start",
      priority: 1,
    },
    // Not drawn: when it started (sorts, exports), the size of its difference, the site, and the phone card's figure.
    { key: "createdAt", label: "Started at", kind: "date", cell: "when", sortable: true, hidden: true, width: "140px", align: "start", priority: 3 },
    { key: "size", label: "Size of difference", kind: "number", cell: "num", hidden: true, requires: "view-cost", width: "90px", align: "end", priority: 3 },
    { key: "site", label: "Site", kind: "text", cell: "muted", hidden: true, requires: "multi-site", width: "140px", align: "start", priority: 3 },
    { key: "figure", label: "Difference or lines", kind: "text", cell: "mono", hidden: true, width: "110px", align: "end", priority: 3 },
    { key: "differWords", label: "Differ, in words", kind: "text", cell: "text", hidden: true, width: "90px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/stock/counts/{id}",
  rowMenu: [
    { key: "open", label: "Open", requires: VIEW, do: { href: "/retail/stock/counts/{id}" } },
    {
      key: "approve",
      label: "Approve the differences",
      requires: APPROVE,
      when: status("TO_APPROVE"),
      do: { href: "/retail/stock/counts/{id}/review" },
    },
    { key: "print", label: "Print count sheet", requires: VIEW, do: PRINT },
    {
      key: "cancel",
      label: "Cancel the count",
      tone: "bad",
      separated: true,
      requires: CANCEL,
      when: OPEN,
      do: { run: "cancelcount", endpoint: "/api/v2/retail/stock/counts/{id}/cancel" },
    },
  ],
  bulk: [
    {
      key: "approve",
      label: "Approve the differences",
      requires: APPROVE,
      do: { run: "approvecounts", endpoint: "/api/v2/retail/stock/counts/approve" },
    },
    { key: "print", label: "Print count sheets", requires: VIEW, do: { ...PRINT, cap: 100 } },
    { key: "export" },
  ],
  primary: { label: "Start a count", icon: "plus", requires: CREATE, sheet: "count-new" },
  card: { title: "name", badge: "state", figure: "figure", meta: "{countNo} · {counter} · {when}", figure2: "differWords" },
  empty: {
    icon: "ClipboardText",
    title: "When did you last count?",
    line: "A blind count on a phone finds what the till cannot.",
    steps: [
      ["Pick a shelf or a category.", "Or everything, after hours."],
      ["Send it to whoever counts.", "They count on their phone, without seeing what is expected."],
      ["Approve the differences.", "Only then does stock change."],
    ],
    primary: { label: "Start a count", sheet: "count-new", requires: CREATE },
  },
};

const countsSource: ReportDefinition = {
  key: "retail-stock-counts",
  title: "Counts",
  area: "Stock",
  href: "/retail/stock/counts",
  profiles: ["RETAIL"],
  params: [],
  columns: counts.columns,
  defaults: { sort: counts.sorts[0]!.rules.slice(0, 1) },
  list: counts,
};

/**
 * A count's lines (STK-06, the record's "Differences" and "Every line" tabs,
 * the `count` parent): what was expected when each was counted, what was
 * counted, the difference and its value at cost (for roles that see cost).
 * The counter of a blind count does not see what was expected while counting.
 */
function lineSpec(differences: boolean): ListSpec {
  return {
    noun: "lines",
    read: VIEW,
    search: { placeholder: "Product", keys: ["product"] },
    filters: [{ key: "count", type: "parent", column: "countId" }],
    sorts: [{ key: "shelf", label: "As counted", rules: [{ column: "order", dir: "asc" }] }],
    columns: [
      { key: "product", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
      { key: "expected", label: "Expected", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 2 },
      { key: "counted", label: "Counted", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 1 },
      {
        key: "difference",
        label: "Difference",
        kind: "number",
        cell: "diff",
        diff: "variance",
        total: "sum",
        width: "110px",
        align: "end",
        priority: 1,
      },
      {
        key: "value",
        label: "Value",
        kind: "money",
        currency: "USD",
        cell: "diff",
        diff: "variance",
        total: "sum",
        requires: "view-cost",
        width: "110px",
        align: "end",
        priority: 1,
      },
      { key: "order", label: "Order", kind: "number", cell: "num", hidden: true, width: "60px", align: "end", priority: 3 },
    ],
    rowHref: "/retail/products/{productId}",
    card: { title: "product", figure: "difference", meta: "{countedWords}" },
    empty: differences
      ? { icon: "ClipboardText", title: "Every line is as expected", line: "Nothing to approve but the count itself." }
      : { icon: "ClipboardText", title: "Nothing on this count", line: "A count holds the lines it was started with." },
  };
}

const differencesSpec = lineSpec(true);
const everyLineSpec = lineSpec(false);

const differencesSource: ReportDefinition = {
  key: "retail-stock-count-differences",
  title: "Differences on a count",
  area: "Stock",
  href: "/retail/stock/counts",
  profiles: ["RETAIL"],
  params: [],
  columns: differencesSpec.columns,
  defaults: { sort: differencesSpec.sorts[0]!.rules },
  list: differencesSpec,
};

const linesSource: ReportDefinition = {
  key: "retail-stock-count-lines",
  title: "Lines on a count",
  area: "Stock",
  href: "/retail/stock/counts",
  profiles: ["RETAIL"],
  params: [],
  columns: everyLineSpec.columns,
  defaults: { sort: everyLineSpec.sorts[0]!.rules },
  list: everyLineSpec,
};

export const STOCK_COUNT_REPORTS: ReportDefinition[] = [countsSource, differencesSource, linesSource];
