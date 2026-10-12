import type { ListGrant, ListSpec, ReportDefinition, ReportFace } from "@/lib/reports/types";

/**
 * Customers (60-customers, CUS-02, CustomersList board): everyone who shops
 * here under their name, most spent first, with their tier, visits, last
 * visit, points and spend in 12 months (`lib/retail/customers/stats.ts`).
 * Paged in the database: search, filters, sort, paging and the totals over
 * every filtered customer are one SQL statement. Binned customers never list.
 */

const VIEW: ListGrant[] = [["retail.customers", "view"]];
const CREATE: ListGrant[] = [["retail.customers", "create"]];
const BIN: ListGrant[] = [["retail.customers", "delete"]];
const UPDATE: ListGrant[] = [["retail.customers", "update"]];

/** Last visit's choices: each a range of days since, so the in-memory engine narrows the same way. */
const LAST_VISIT = [
  { value: "in-30", label: "In the last 30 days", where: [{ column: "daysSince", op: "lt" as const, value: "30" }] },
  { value: "30-90", label: "30 to 90 days ago", where: [{ column: "daysSince", op: "between" as const, value: ["30", "90"] }] },
  { value: "over-90", label: "Over 90 days ago", where: [{ column: "daysSince", op: "gt" as const, value: "90" }] },
  { value: "never", label: "Never", where: [{ column: "lastVisitAt", op: "empty" as const }] },
];

const customers: ListSpec = {
  noun: "customers",
  read: VIEW,
  search: { placeholder: "Name, phone or card", keys: ["name", "phoneSearch", "cardNo", "code"] },
  filters: [
    { key: "tier", label: "Tier", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "tier" },
    { key: "lastVisit", label: "Last visit", type: "choice", any: "Any", primary: true, options: LAST_VISIT },
    {
      key: "messages",
      label: "Messages",
      type: "choice",
      any: "Anyone",
      options: [
        { value: "agreed", label: "Agreed", where: [{ column: "consent", op: "is", value: ["yes"] }] },
        { value: "not-agreed", label: "Not agreed", where: [{ column: "consent", op: "is", value: ["no"] }] },
      ],
    },
    {
      key: "account",
      label: "Account",
      type: "choice",
      any: "Anyone",
      options: [
        { value: "has", label: "Has an account", where: [{ column: "account", op: "is", value: ["yes"] }] },
        { value: "none", label: "No account", where: [{ column: "account", op: "is", value: ["no"] }] },
      ],
    },
  ],
  sorts: [
    {
      key: "spent",
      label: "Most spent",
      rules: [
        { column: "spend12m", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "visits",
      label: "Most visits",
      rules: [
        { column: "visits", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "points",
      label: "Most points",
      rules: [
        { column: "points", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "last-visit",
      label: "Last visit, newest",
      rules: [
        { column: "lastVisitAt", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "longest",
      label: "Longest since a visit",
      rules: [
        { column: "lastVisitAt", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "newest", label: "Newest members", rules: [{ column: "createdAt", dir: "desc" }] },
  ],
  groups: ["tier", "visitBand"],
  columns: [
    {
      key: "name",
      label: "Customer",
      kind: "text",
      cell: "link",
      href: "/retail/customers/{id}",
      width: "minmax(180px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "phone", label: "Phone", kind: "phone", cell: "mono", width: "150px", align: "start", priority: 2 },
    { key: "tier", label: "Tier", kind: "status", cell: "state", toneKey: "tierTone", width: "110px", align: "start", priority: 2 },
    { key: "visits", label: "Visits", kind: "number", cell: "num", total: "sum", width: "80px", align: "end", priority: 2 },
    { key: "lastVisitAt", label: "Last visit", kind: "date", cell: "date", width: "150px", align: "start", priority: 3 },
    { key: "points", label: "Points", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    {
      key: "spend12m",
      label: "Spend, 12 months",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      width: "130px",
      align: "end",
      priority: 1,
    },
    // Not drawn: the Last visit group's words.
    { key: "visitBand", label: "Last visit, when", kind: "text", cell: "text", hidden: true, width: "150px", align: "start", priority: 3 },
  ],
  rowHref: "/retail/customers/{id}",
  rowMenu: [
    { key: "points", label: "Adjust points", requires: UPDATE, do: { href: "/retail/customers?sheet=points&id={id}" } },
    { key: "message", label: "Message on WhatsApp", requires: UPDATE, do: { href: "/retail/customers?sheet=message&ids={id}" } },
    { key: "bin", label: "Move to the bin", tone: "bad", requires: BIN, do: { run: "bincustomer", endpoint: "/api/v2/retail/bin" } },
  ],
  bulk: [
    { key: "message", label: "Message on WhatsApp", requires: UPDATE, do: { sheet: "message" } },
    { key: "points", label: "Add points", requires: UPDATE, do: { sheet: "points" } },
    { key: "tier", label: "Change tier", requires: UPDATE, do: { sheet: "customer-tier" } },
    { key: "export" },
  ],
  primary: { label: "New customer", icon: "plus", requires: CREATE, sheet: "customer-new" },
  card: { title: "name", badge: "tier", figure: "spend12m", meta: "{phone} · {visitsWords}", metaMono: ["phone"], figure2: "points" },
  empty: {
    icon: "Users",
    title: "No customers yet",
    line: "Customers join at the till when they give their phone number, or add them here.",
    primary: { label: "New customer", sheet: "customer-new", requires: CREATE },
  },
};

/**
 * Customers as Reports reads them (70-insights-reports 5.14): the list's
 * columns, Owed (packet 66's, empty until then) and a count for a roll-up.
 */
const report: ReportFace = {
  area: "customers",
  startsFrom: { title: "Customers", sub: "Spend, visits, points and what is owed" },
  noun: "customers",
  read: VIEW,
  search: { placeholder: "Name, phone or card", keys: ["name", "phoneSearch", "cardNo", "code"] },
  filters: [
    { key: "tier", label: "Tier", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "tier" },
    {
      key: "lastVisit",
      label: "Last visit",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        { value: "this-week", label: "This week", where: [{ column: "thisWeek", op: "notEmpty" }] },
        { value: "this-month", label: "This month", where: [{ column: "thisMonth", op: "notEmpty" }] },
        { value: "not-30", label: "Not in 30 days", where: [{ column: "notIn30", op: "notEmpty" }] },
        { value: "not-90", label: "Not in 90 days", where: [{ column: "notIn90", op: "notEmpty" }] },
      ],
    },
  ],
  sorts: [
    {
      key: "spent",
      label: "Most spent",
      rules: [
        { column: "spend12", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "last-visit",
      label: "Last visit",
      rules: [
        { column: "lastVisit", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["tier"],
  columns: [
    {
      key: "name",
      label: "Customer",
      kind: "text",
      cell: "link",
      href: "/retail/customers/{id}",
      width: "minmax(180px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "phone", label: "Phone", kind: "phone", cell: "mono", width: "150px", align: "start", priority: 2 },
    { key: "tier", label: "Tier", kind: "status", cell: "state", toneKey: "tierTone", width: "110px", align: "start", priority: 2 },
    { key: "visits", label: "Visits", kind: "number", cell: "num", total: "sum", width: "80px", align: "end", priority: 2 },
    { key: "lastVisit", label: "Last visit", kind: "date", cell: "date", width: "150px", align: "start", priority: 3 },
    { key: "points", label: "Points", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "spend12", label: "Spend, 12 months", kind: "money", currency: "USD", cell: "money", total: "sum", width: "130px", align: "end", priority: 1 },
    { key: "owed", label: "Owed", kind: "money", currency: "USD", cell: "money", total: "sum", hidden: true, width: "120px", align: "end", priority: 2 },
    { key: "customers", label: "Customers", kind: "number", cell: "num", total: "sum", width: "110px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/customers/{id}",
  bulk: [{ key: "export" }],
  card: { title: "name", badge: "tier", figure: "spend12", meta: "{phone} · {visitsWords}", metaMono: ["phone"], figure2: "points" },
  empty: { icon: "Users", title: "No customers", line: "Nobody matches these filters." },
  rollups: [
    { key: "none", label: "Customer" },
    { key: "tier", label: "Tier" },
  ],
  rollupOnly: "customers",
};

const customersSource: ReportDefinition = {
  key: "retail-customers",
  title: "Customers",
  area: "Customers",
  href: "/retail/customers",
  profiles: ["RETAIL"],
  params: [],
  columns: customers.columns,
  defaults: { sort: customers.sorts[0]!.rules.slice(0, 1) },
  list: customers,
  report,
};

/* ── A customer's record (CUS-03, packet 61) ─────────────────────────────── */

/** "What" on Points movements: each a kind of row, the reason telling a birthday bonus from another adjustment. */
export const POINTS_WHAT = [
  { value: "earned", label: "Earned" },
  { value: "spent", label: "Spent" },
  { value: "adjusted", label: "Adjusted" },
  { value: "birthday", label: "Birthday bonus" },
  { value: "expired", label: "Expired" },
  { value: "refunds", label: "Refunds" },
];

/**
 * A customer's points ledger (`retail-points`): every movement, newest first,
 * with the balance it left, worked out over the customer's whole ledger
 * before the page is cut. The record's Points ledger tab reads its 12 months;
 * Points movements reads all of it.
 */
const points: ListSpec = {
  noun: "movements",
  read: VIEW,
  search: { placeholder: "Receipt or note", keys: ["ref", "note"] },
  filters: [
    { key: "what", label: "What", type: "choice", any: "Any", primary: true, options: POINTS_WHAT },
    { key: "when", label: "When", type: "period", any: "Any time", column: "day", primary: true },
    { key: "customer", type: "parent", column: "customerId" },
  ],
  sorts: [
    { key: "newest", label: "Newest first", rules: [{ column: "at", dir: "desc" }] },
    { key: "oldest", label: "Oldest first", rules: [{ column: "at", dir: "asc" }] },
    { key: "biggest", label: "Biggest first", rules: [{ column: "size", dir: "desc" }] },
  ],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", width: "150px", align: "start", priority: 1 },
    { key: "what", label: "What", kind: "text", cell: "dot", toneKey: "tone", titleKey: "note", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "ref", label: "Receipt", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "120px", align: "start", priority: 1 },
    { key: "by", label: "By", kind: "text", cell: "text", width: "120px", align: "start", priority: 2 },
    { key: "note", label: "Note", kind: "text", cell: "muted", width: "minmax(0,1fr)", align: "start", priority: 3 },
    { key: "points", label: "Points", kind: "number", cell: "num", sign: "gain", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "balance", label: "Balance", kind: "number", cell: "num", width: "90px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  bulk: [{ key: "export" }],
  card: { title: "what", figure: "points", meta: "{whenText} · {by}", figure2: "balance" },
  empty: { icon: "Clock", title: "No points yet", line: "Points start with their first sale." },
};

/**
 * A customer's purchases (`retail-customer-purchases`): their sales, refunds
 * and voids, newest first, with what each earned.
 */
const purchases: ListSpec = {
  noun: "sales",
  read: VIEW,
  search: { placeholder: "Sale", keys: ["ref"] },
  filters: [{ key: "customer", type: "parent", column: "customerId" }],
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "at", dir: "desc" }] }],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", width: "150px", align: "start", priority: 1 },
    { key: "ref", label: "Sale", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "120px", align: "start", priority: 1 },
    { key: "items", label: "Items", kind: "number", cell: "num", total: "sum", width: "70px", align: "end", priority: 2 },
    { key: "paidWith", label: "Paid with", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 2 },
    { key: "points", label: "Points", kind: "number", cell: "num", sign: "gain", total: "sum", width: "90px", align: "end", priority: 2 },
    { key: "total", label: "Total", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  bulk: [{ key: "export" }],
  card: { title: "ref", figure: "total", meta: "{whenText} · {paidWith}" },
  empty: { icon: "Receipt", title: "No purchases yet", line: "Their sales show here once they buy with their number." },
};

/** A customer's notes (`retail-customer-notes`), newest first. */
const notes: ListSpec = {
  noun: "notes",
  read: VIEW,
  search: { placeholder: "Note or who wrote it", keys: ["body", "by"] },
  filters: [{ key: "customer", type: "parent", column: "customerId" }],
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "at", dir: "desc" }] }],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", width: "150px", align: "start", priority: 1 },
    { key: "body", label: "Note", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "by", label: "By", kind: "text", cell: "text", width: "160px", align: "start", priority: 2 },
  ],
  rowHref: "/retail/customers/{customerId}",
  bulk: [{ key: "export" }],
  card: { title: "body", figure: "by", meta: "{whenText}" },
  empty: { icon: "FileText", title: "No notes yet", line: "Notes about them show here." },
};

const recordSource = (key: string, title: string, list: ListSpec): ReportDefinition => ({
  key,
  title,
  area: "Customers",
  href: "/retail/customers",
  profiles: ["RETAIL"],
  params: [],
  columns: list.columns,
  defaults: { sort: list.sorts[0]!.rules },
  list,
});

export const CUSTOMER_REPORTS: ReportDefinition[] = [
  customersSource,
  recordSource("retail-points", "Points movements", points),
  recordSource("retail-customer-purchases", "A customer's purchases", purchases),
  recordSource("retail-customer-notes", "A customer's notes", notes),
];
