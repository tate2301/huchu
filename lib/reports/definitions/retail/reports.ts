import type { ListColumn, ListGrant, ReportDefinition, ReportFace } from "@/lib/reports/types";

/**
 * The two sources Reports reads that no list page shows (70-insights-reports
 * decision 5, 5.14): every line sold, and every payment taken. They have a
 * report face and no list. Both read posted sales and refunds — a refund's
 * lines and payments negative, voided sales and void documents left out — so
 * a voided sale and its void add nothing, and both page in the database.
 *
 * Read as the floor's sales are: whoever sells or keeps the cash, a cashier
 * only their own.
 */

const READ: ListGrant[] = [
  ["retail.sell", "view"],
  ["retail.cash-control", "view"],
];
const OWN = { roles: ["CASHIER"], column: "cashierId", filter: "cashier" };

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

const site = {
  key: "site",
  label: "Shop",
  type: "choice" as const,
  any: "Any",
  primary: true,
  optionsFromLoader: true,
  column: "siteId",
  requires: "multi-site" as const,
};

const cashier = (primary: boolean) => ({
  key: "cashier",
  label: "Cashier",
  type: "choice" as const,
  any: "Anyone",
  primary,
  optionsFromLoader: true,
  column: "cashierId",
});

const itemsSold: ReportFace = {
  area: "selling",
  startsFrom: { title: "Items sold", sub: "Each line, with its margin" },
  noun: "items",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Product, sale or cashier", keys: ["item", "saleNo", "cashier"] },
  filters: [
    { key: "when", label: "Period", type: "period", any: "Any time", column: "date", primary: true, default: "30d" },
    site,
    cashier(true),
    { key: "category", label: "Category", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "categoryId" },
  ],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "at", dir: "desc" },
        { column: "id", dir: "desc" },
      ],
    },
    { key: "most-revenue", label: "Most revenue", rules: [{ column: "revenue", dir: "desc" }] },
    { key: "most-sold", label: "Most sold", rules: [{ column: "quantity", dir: "desc" }] },
    { key: "lowest-margin", label: "Lowest margin", rules: [{ column: "marginRate", dir: "asc" }] },
  ],
  groups: ["item", "category", "cashier", "site", "date"],
  columns: [
    {
      key: "item",
      label: "Item",
      kind: "text",
      cell: "link",
      href: "/retail/products/{productId}",
      width: "minmax(180px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "date", label: "Date", kind: "date", cell: "date", timeKey: "time", width: "150px", align: "start", priority: 1 },
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "120px", align: "start", priority: 2 },
    { key: "cashier", label: "Cashier", kind: "text", cell: "muted", width: "130px", align: "start", priority: 2 },
    { key: "category", label: "Category", kind: "text", cell: "muted", hidden: true, width: "130px", align: "start", priority: 3 },
    { key: "site", label: "Shop", kind: "text", cell: "text", hidden: true, requires: "multi-site", width: "150px", align: "start", priority: 3 },
    { key: "quantity", label: "Quantity", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    money("unitPrice", "Price", { total: "avg", width: "100px" }),
    money("revenue", "Revenue"),
    money("cost", "Cost", { requires: "view-cost", width: "110px" }),
    money("margin", "Margin", { requires: "view-cost", width: "110px" }),
    {
      key: "marginRate",
      label: "Margin %",
      kind: "number",
      cell: "num",
      percent: true,
      ratio: { num: "margin", den: "revenue" },
      total: "avg",
      requires: "view-cost",
      hidden: true,
      width: "90px",
      align: "end",
      priority: 3,
    },
    { key: "lines", label: "Lines", kind: "number", cell: "num", total: "sum", width: "80px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  bulk: [{ key: "export" }],
  card: { title: "item", figure: "revenue", meta: "{saleNo} · {cashier}", figure2: "quantity" },
  empty: { icon: "Receipt", title: "Nothing sold", line: "No sale or refund was rung in this period." },
  rollups: [
    { key: "none", label: "Line" },
    { key: "item", label: "Product" },
    { key: "category", label: "Category" },
    { key: "date", label: "Day" },
    { key: "site", label: "Shop" },
    { key: "cashier", label: "Cashier" },
  ],
  rollupOnly: "lines",
};

/** "Paid with": exclusive, so a row's tenders add up to what it took. ZiG is any payment in ZiG. */
export const PAYMENT_TENDERS = [
  { value: "cash", label: "Cash" },
  { value: "ecocash", label: "EcoCash" },
  { value: "card", label: "Card" },
  { value: "zig", label: "ZiG" },
  { value: "account", label: "On account" },
  { value: "other", label: "Other" },
] as const;

const payments: ReportFace = {
  area: "money",
  startsFrom: { title: "Payments", sub: "Each payment taken, by till" },
  noun: "payments",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Sale or reference", keys: ["saleNo", "reference"] },
  filters: [
    { key: "when", label: "Period", type: "period", any: "Any time", column: "day", primary: true, default: "30d" },
    site,
    { key: "till", label: "Till", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "tillId" },
    {
      key: "tender",
      label: "Paid with",
      type: "choice",
      any: "Any",
      primary: true,
      column: "tenderKey",
      options: PAYMENT_TENDERS.map((tender) => ({ ...tender })),
    },
    cashier(false),
  ],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "when", dir: "desc" },
        { column: "id", dir: "desc" },
      ],
    },
    { key: "biggest", label: "Biggest first", rules: [{ column: "amount", dir: "desc" }] },
  ],
  groups: ["till", "tender", "site", "day"],
  columns: [
    { key: "when", label: "When", kind: "date", cell: "when", width: "130px", align: "start", priority: 1 },
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "120px", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "text", width: "120px", align: "start", priority: 2 },
    { key: "site", label: "Shop", kind: "text", cell: "muted", hidden: true, requires: "multi-site", width: "150px", align: "start", priority: 3 },
    { key: "cashier", label: "Cashier", kind: "text", cell: "muted", width: "130px", align: "start", priority: 2 },
    { key: "tender", label: "Paid with", kind: "text", cell: "text", width: "120px", align: "start", priority: 1 },
    { key: "reference", label: "Reference", kind: "code", cell: "mono", hidden: true, width: "140px", align: "start", priority: 3 },
    money("amount", "Amount"),
    ...PAYMENT_TENDERS.map((tender) => money(tender.value, tender.label, { hidden: true, width: "130px" })),
    money("taken", "Taken", { hidden: true, width: "140px" }),
    { key: "payments", label: "Payments", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 1 },
    { key: "day", label: "Day", kind: "date", cell: "date", hidden: true, width: "140px", align: "start", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  bulk: [{ key: "export" }],
  card: { title: "tender", figure: "amount", meta: "{saleNo} · {till}" },
  empty: { icon: "Money", title: "No payments", line: "No payment was taken in this period." },
  rollups: [
    { key: "none", label: "Payment" },
    { key: "day", label: "Day" },
    { key: "till", label: "Till" },
    { key: "tender", label: "Paid with" },
    { key: "site", label: "Shop" },
  ],
  rollupOnly: "payments",
};

const source = (key: string, title: string, area: string, report: ReportFace, newest: string): ReportDefinition => ({
  key,
  title,
  area,
  href: "/retail/reports",
  profiles: ["RETAIL"],
  params: [],
  columns: report.columns,
  defaults: { sort: [{ column: newest, dir: "desc" }] },
  report,
});

export const REPORT_ONLY_REPORTS: ReportDefinition[] = [
  source("retail-items-sold", "Items sold", "Selling", itemsSold, "date"),
  source("retail-payments", "Payments", "Money", payments, "when"),
];
