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
    // "Adjust points" (packet 64), "Message on WhatsApp" (55) and "Edit everything" (61) join with their sheets.
    { key: "bin", label: "Move to the bin", tone: "bad", requires: BIN, do: { run: "bincustomer", endpoint: "/api/v2/retail/bin" } },
  ],
  // "Message on WhatsApp" (55), "Add points" and "Change tier" (64) join with their sheets.
  bulk: [{ key: "export" }],
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

export const CUSTOMER_REPORTS: ReportDefinition[] = [customersSource];
