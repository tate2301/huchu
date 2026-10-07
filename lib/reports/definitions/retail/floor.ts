import type { ListColumn, ListSpec, ReportDefinition, ReportFace } from "@/lib/reports/types";

/**
 * The floor's lists (00-foundations 5.5; 50-floor adds sales).
 *
 * Shifts is the reference list every other working list copies: two primary
 * filters on the toolbar, the rest in Filters, a state column whose problem
 * tones are counted in the totals band, and every figure totalled over the
 * whole filtered set.
 */

const shifts: ListSpec = {
  noun: "shifts",
  // Owners, managers and bookkeepers through cash control; a cashier through
  // the till, and then only their own (scopeOwn).
  read: [
    ["retail.cash-control", "view"],
    ["retail.sell", "view"],
  ],
  scopeOwn: { roles: ["CASHIER"], column: "cashierId", filter: "cashier" },
  search: { placeholder: "Shift, cashier or till", keys: ["shiftNo", "cashier", "till"] },
  filters: [
    { key: "till", label: "Till", type: "choice", any: "Any", optionsFromLoader: true, column: "tillCode", primary: true },
    {
      key: "cashier",
      label: "Cashier",
      type: "choice",
      any: "Anyone",
      optionsFromLoader: true,
      column: "cashierId",
      primary: true,
    },
    {
      key: "state",
      label: "State",
      type: "choice",
      any: "Any",
      options: [
        { value: "open", label: "Open", where: [{ column: "state", op: "is", value: ["Open"] }] },
        { value: "short", label: "Short", where: [{ column: "state", op: "is", value: ["Short"] }] },
        { value: "over", label: "Over", where: [{ column: "state", op: "is", value: ["Over"] }] },
        { value: "not-counted", label: "Not counted", where: [{ column: "state", op: "is", value: ["Not counted"] }] },
        { value: "balanced", label: "Balanced", where: [{ column: "state", op: "is", value: ["Balanced"] }] },
      ],
    },
    { key: "opened", label: "Opened", type: "period", any: "Any time", column: "openedAt", default: "30d" },
    {
      key: "variance",
      label: "Variance",
      type: "choice",
      any: "Any",
      options: [
        { value: "short", label: "Short only", where: [{ column: "variance", op: "lt", value: "0" }] },
        { value: "over", label: "Over only", where: [{ column: "variance", op: "gt", value: "0" }] },
        {
          value: "any-difference",
          label: "Any difference",
          where: [
            { column: "variance", op: "notEmpty" },
            { column: "variance", op: "isNot", value: ["0"] },
          ],
        },
      ],
    },
    {
      key: "takings",
      label: "Takings",
      type: "choice",
      any: "Any",
      options: [
        { value: "under-100", label: "Under US$100", where: [{ column: "takings", op: "lt", value: "100" }] },
        { value: "100-500", label: "US$100 to US$500", where: [{ column: "takings", op: "between", value: ["100", "500"] }] },
        { value: "over-500", label: "Over US$500", where: [{ column: "takings", op: "gt", value: "500" }] },
      ],
    },
  ],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "openedAt", dir: "desc" },
        { column: "openedTime", dir: "desc" },
      ],
    },
    {
      key: "oldest",
      label: "Oldest first",
      rules: [
        { column: "openedAt", dir: "asc" },
        { column: "openedTime", dir: "asc" },
      ],
    },
    { key: "most-taken", label: "Most taken", rules: [{ column: "takings", dir: "desc" }] },
    { key: "biggest-difference", label: "Biggest difference", rules: [{ column: "varianceSize", dir: "desc" }] },
  ],
  groups: ["state", "cashier", "till"],
  columns: [
    { key: "shiftNo", label: "Shift", kind: "code", cell: "ref", width: "104px", align: "start", priority: 1 },
    { key: "cashier", label: "Cashier", kind: "text", cell: "text", width: "minmax(132px,1fr)", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "muted", width: "96px", align: "start", priority: 3 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      width: "124px",
      align: "start",
      priority: 1,
      tones: { Open: "info", Short: "bad", Over: "warn", "Not counted": "pending", Balanced: "hollow" },
      summary: { tones: ["bad", "warn", "pending"], label: "to check" },
    },
    {
      key: "openedAt",
      label: "Opened",
      kind: "date",
      cell: "date",
      timeKey: "openedTime",
      sortable: true,
      width: "160px",
      align: "start",
      priority: 2,
    },
    {
      key: "durationMinutes",
      label: "Duration",
      kind: "number",
      cell: "duration",
      runningKey: "running",
      width: "104px",
      align: "start",
      priority: 3,
    },
    { key: "sales", label: "Sales", kind: "number", cell: "num", total: "sum", width: "64px", align: "end", priority: 1 },
    {
      key: "takings",
      label: "Takings",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      sortable: true,
      width: "128px",
      align: "end",
      priority: 1,
    },
    {
      key: "variance",
      label: "Variance",
      kind: "money",
      currency: "USD",
      cell: "diff",
      diff: "variance",
      total: "sum",
      width: "136px",
      align: "end",
      priority: 1,
    },
  ],
  rowHref: "/retail/shifts/{id}",
  // The row menu is the floor spec's (C-25, 50-floor 5.4): Open, and the
  // closed day's Z-report. Its shift actions (cash in or out, count and close,
  // the X-report, sign-off) arrive with the pages and sheets they open.
  rowMenu: [
    {
      key: "open",
      label: "Open",
      requires: [
        ["retail.cash-control", "view"],
        ["retail.sell", "view"],
      ],
      do: { href: "/retail/shifts/{id}" },
    },
    {
      key: "z-report",
      label: "Print Z-report",
      requires: [["retail.cash-control", "view"]],
      when: [{ column: "state", op: "isNot", value: ["Open"] }],
      do: { download: "/api/v2/retail/z-reports/print", idsAs: "shiftIds", open: true },
    },
  ],
  bulk: [
    {
      key: "print-z",
      label: "Print Z-reports",
      requires: [["retail.cash-control", "view"]],
      do: {
        download: "/api/v2/retail/z-reports/print",
        idsAs: "shiftIds",
        open: true,
        cap: 500,
        notice: { header: "X-Not-Closed", text: "{n} of these days are not closed yet." },
      },
    },
    { key: "export" },
    {
      key: "copy",
      label: "Copy shift numbers",
      requires: [
        ["retail.cash-control", "view"],
        ["retail.sell", "view"],
      ],
      do: { copy: "shiftNo", done: "{n} shift numbers copied." },
    },
    {
      key: "z-csv",
      label: "Download Z-reports as CSV",
      more: true,
      requires: [["retail.cash-control", "view"]],
      do: {
        download: "/api/v2/retail/z-reports/export",
        idsAs: "shiftIds",
        with: { format: "csv" },
        cap: 500,
        notice: { header: "X-Not-Closed", text: "{n} of these days are not closed yet." },
      },
    },
    {
      key: "compare",
      label: "Compare cashiers",
      more: true,
      requires: [["retail.insights", "view"]],
      do: { href: "/retail/insights/sales?tab=cashier&from={min:openedAt}&to={max:openedAt}" },
    },
  ],
  primary: {
    label: "Open shift",
    icon: "plus",
    requires: [
      ["retail.cash-control", "open-shift"],
      ["retail.sell", "open-shift"],
    ],
    sheet: "shift-open",
  },
  card: { title: "cashier", badge: "state", figure: "takings", meta: "{shiftNo} · {tillShort} · {cardWhen}", figure2: "variance" },
  empty: {
    icon: "CashRegister",
    title: "No shifts yet",
    line: "A shift starts when a cashier opens a till with its float. Each one closes with a count.",
    primary: {
      label: "Open shift",
      sheet: "shift-open",
      requires: [
        ["retail.cash-control", "open-shift"],
        ["retail.sell", "open-shift"],
      ],
    },
  },
};

const money = (key: string, label: string, extra: Partial<ListColumn> = {}): ListColumn => ({
  key,
  label,
  kind: "money",
  currency: "USD",
  cell: "money",
  total: "sum",
  width: "120px",
  align: "end",
  priority: 1,
  ...extra,
});

/**
 * Shifts as Reports reads them (70-insights-reports 5.14): each shift counted
 * against what the drawer should hold, with its float, refunds, voids and the
 * times the drawer opened with no sale. The same rows and read as the list.
 */
const report: ReportFace = {
  area: "floor",
  startsFrom: { title: "Till shifts", sub: "Each shift, counted against expected" },
  noun: "shifts",
  read: shifts.read,
  scopeOwn: shifts.scopeOwn,
  search: shifts.search,
  filters: [
    { key: "opened", label: "Period", type: "period", any: "Any time", column: "openedAt", primary: true, default: "30d" },
    {
      key: "site",
      label: "Shop",
      type: "choice",
      any: "Any",
      primary: true,
      optionsFromLoader: true,
      column: "siteId",
      requires: "multi-site",
    },
    { key: "till", label: "Till", type: "choice", any: "Any", optionsFromLoader: true, column: "tillCode", primary: true },
    { key: "cashier", label: "Cashier", type: "choice", any: "Anyone", optionsFromLoader: true, column: "cashierId", primary: true },
    shifts.filters.find((filter) => filter.key === "state")!,
  ],
  sorts: [shifts.sorts[0]!, shifts.sorts[3]!],
  groups: ["till", "cashier", "state", "openedAt"],
  columns: [
    { key: "shiftNo", label: "Shift", kind: "code", cell: "ref", width: "110px", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "muted", width: "120px", align: "start", priority: 2 },
    { key: "cashier", label: "Cashier", kind: "text", cell: "text", width: "140px", align: "start", priority: 1 },
    {
      key: "openedAt",
      label: "Opened",
      kind: "date",
      cell: "date",
      timeKey: "openedTime",
      sortable: true,
      width: "160px",
      align: "start",
      priority: 2,
    },
    { ...shifts.columns.find((column) => column.key === "state")!, width: "120px" },
    money("float", "Float", { width: "110px" }),
    money("takings", "Takings", { sortable: true }),
    money("expected", "Expected"),
    money("counted", "Counted"),
    money("variance", "Short or over", { cell: "diff", diff: "variance", width: "130px" }),
    money("refunds", "Refunds", { hidden: true }),
    money("voids", "Voids", { hidden: true }),
    { key: "noSaleOpens", label: "No-sale opens", kind: "number", cell: "num", total: "sum", hidden: true, width: "110px", align: "end", priority: 3 },
    { key: "shifts", label: "Shifts", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/shifts/{id}",
  bulk: [{ key: "export" }],
  card: shifts.card,
  empty: { icon: "CashRegister", title: "No shifts", line: "No till was opened in this period." },
  rollups: [
    { key: "none", label: "Shift" },
    { key: "cashier", label: "Cashier" },
    { key: "till", label: "Till" },
    { key: "openedAt", label: "Day" },
  ],
  rollupOnly: "shifts",
};

const shiftsSource: ReportDefinition = {
  key: "retail-shifts",
  title: "Shifts",
  area: "The floor",
  href: "/retail/shifts",
  profiles: ["RETAIL"],
  params: [],
  columns: shifts.columns,
  defaults: { sort: shifts.sorts[0]!.rules.filter((rule) => rule.column === "openedAt") },
  list: shifts,
  report,
};

export const FLOOR_REPORTS: ReportDefinition[] = [shiftsSource];
