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
  // The row menu is the floor spec's (C-25, 50-floor 5.4): Open; on an open
  // shift, Count and close (FLR-04), Record cash in or out and the X-report
  // (FLR-03); the closed day's Z-report. Sign-off arrives with its sheet.
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
      key: "count-and-close",
      label: "Count and close",
      requires: [
        ["retail.cash-control", "close-shift"],
        ["retail.sell", "close-shift"],
      ],
      when: [{ column: "state", op: "is", value: ["Open"] }],
      do: { href: "/retail/shifts/{id}/close" },
    },
    {
      key: "cash-move",
      label: "Record cash in or out",
      requires: [
        ["retail.cash-control", "update"],
        ["retail.sell", "create"],
      ],
      when: [{ column: "state", op: "is", value: ["Open"] }],
      do: { href: "/retail/shifts/{id}?sheet=cash-move&id={id}" },
    },
    {
      key: "x-report",
      label: "Print X-report",
      // A till action: cash control or selling at a till; the bookkeeper only reads (acceptance 6).
      requires: [
        ["retail.cash-control", "update"],
        ["retail.sell", "open-shift"],
      ],
      when: [{ column: "state", op: "is", value: ["Open"] }],
      do: { open: "/api/v2/retail/records/RetailShift/{id}/pdf?as=x-report" },
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

/** "Paid with": each way of paying, matched against the row's ways ("|Cash|EcoCash|"). Lay-by joins with FLR-06. */
const PAID_WITH: Array<[value: string, label: string]> = [
  ["cash", "Cash"],
  ["zig", "ZiG"],
  ["ecocash", "EcoCash"],
  ["card", "Card"],
  ["transfer", "Bank transfer"],
  ["innbucks", "InnBucks"],
  ["on-account", "On account"],
  ["voucher", "Voucher"],
];

const SELL_OR_CASH: ListSpec["read"] = [
  ["retail.sell", "view"],
  ["retail.cash-control", "view"],
];

/**
 * Sales (50-floor, SalesList board): every sale and refund the tills rang,
 * newest first. VOID documents never list; a voided sale shows its total in
 * `--ink-3` and the totals leave it out (its money came back). Sales pass
 * 5,000, so the loader pages in the database.
 */
const sales: ListSpec = {
  noun: "sales",
  read: SELL_OR_CASH,
  scopeOwn: { roles: ["CASHIER", "POS_CASHIER"], column: "cashierId", filter: "cashier" },
  search: { placeholder: "Sale, receipt, customer or product", keys: ["saleNo", "receiptNo", "customer", "itemNames"] },
  tabs: [
    { key: "today", label: "Today", where: [{ column: "today", op: "is", value: ["yes"] }] },
    { key: "refunds", label: "Refunds", where: [{ column: "saleType", op: "is", value: ["REFUND"] }] },
    { key: "voids", label: "Voids", where: [{ column: "voided", op: "is", value: ["yes"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    { key: "till", label: "Till", type: "choice", any: "Any", optionsFromLoader: true, column: "tillId", primary: true },
    { key: "cashier", label: "Cashier", type: "choice", any: "Anyone", optionsFromLoader: true, column: "cashierId", primary: true },
    { key: "when", label: "When", type: "period", any: "Any time", column: "day" },
    {
      key: "paidWith",
      label: "Paid with",
      type: "choice",
      any: "Any",
      options: PAID_WITH.map(([value, label]) => ({ value, label, where: [{ column: "ways", op: "contains", value: `|${label}|` }] })),
    },
    {
      key: "site",
      label: "Site",
      type: "choice",
      any: "All sites",
      optionsFromLoader: true,
      column: "siteId",
      requires: "multi-site",
      defaultFrom: "default-site",
    },
    {
      key: "flagged",
      label: "Flagged",
      type: "choice",
      any: "Any",
      options: [{ value: "only", label: "Only flagged", where: [{ column: "flagged", op: "is", value: ["yes"] }] }],
    },
    { key: "shift", type: "parent", column: "shiftId" },
  ],
  sorts: [
    { key: "newest", label: "Newest first", rules: [{ column: "postedAt", dir: "desc" }] },
    { key: "oldest", label: "Oldest first", rules: [{ column: "postedAt", dir: "asc" }] },
    { key: "biggest", label: "Biggest first", rules: [{ column: "size", dir: "desc" }] },
  ],
  groups: ["till", "cashier", "paidWith", "state"],
  columns: [
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", width: "120px", align: "start", priority: 1 },
    { key: "when", label: "When", kind: "text", cell: "mono", width: "110px", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "text", width: "130px", align: "start", priority: 2 },
    { key: "cashier", label: "Cashier", kind: "text", cell: "muted", width: "140px", align: "start", priority: 2 },
    {
      key: "customer",
      label: "Customer",
      kind: "text",
      cell: "link",
      href: "/retail/customers/{customerId}",
      toneKey: "customerTone",
      width: "minmax(150px,1fr)",
      align: "start",
      priority: 1,
    },
    { key: "items", label: "Items", kind: "number", cell: "num", total: "sum", width: "70px", align: "end", priority: 3 },
    { key: "paidWith", label: "Paid with", kind: "text", cell: "text", width: "120px", align: "start", priority: 3 },
    {
      key: "total",
      label: "Total",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      totalOf: "counted",
      toneKey: "totalTone",
      width: "120px",
      align: "end",
      priority: 1,
    },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      width: "130px",
      align: "start",
      priority: 1,
      tones: { Sold: "hollow", Refund: "warn", Voided: "bad", Refunded: "hollow", "Part refunded": "hollow", "To look at": "warn" },
    },
  ],
  rowHref: "/retail/sales/{id}",
  rowMenu: [
    { key: "open", label: "Open", requires: SELL_OR_CASH, do: { href: "/retail/sales/{id}" } },
    {
      key: "reprint",
      label: "Reprint the receipt",
      requires: SELL_OR_CASH,
      // POSTed, so each copy is one click and one "Printed a copy of the receipt".
      do: { download: "/api/v2/retail/sales/{id}/receipt", open: true },
    },
    {
      key: "send",
      label: "Send on WhatsApp",
      requires: SELL_OR_CASH,
      when: [{ column: "customerPhone", op: "notEmpty" }],
      do: { run: "send-receipt", endpoint: "/api/v2/retail/sales/{id}/send" },
    },
    {
      key: "send-to",
      label: "Send on WhatsApp",
      requires: SELL_OR_CASH,
      when: [{ column: "customerPhone", op: "empty" }],
      do: { sheet: "sale-send" },
    },
  ],
  bulk: [
    {
      key: "send-receipts",
      label: "Send receipts",
      requires: [["retail.sell", "view"]],
      do: { run: "send-receipts", endpoint: "/api/v2/retail/sales/send" },
    },
    { key: "export" },
  ],
  card: { title: "saleNo", badge: "state", figure: "total", meta: "{when} · {till} · {cashier}", figure2: "paidWith" },
  empty: { icon: "Receipt", title: "No sales yet", line: "Sales appear here as the tills ring them up." },
};

const salesSource: ReportDefinition = {
  key: "retail-sales",
  title: "Sales",
  area: "The floor",
  href: "/retail/sales",
  profiles: ["RETAIL"],
  params: [],
  columns: sales.columns,
  // The list's own sorts order it (newest first); no column holds the instant itself.
  defaults: {},
  list: sales,
};

export const FLOOR_REPORTS: ReportDefinition[] = [shiftsSource, salesSource];
