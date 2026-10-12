import type { ListGrant, ListSpec, ReportDefinition, ReportFace } from "@/lib/reports/types";

/**
 * Empties (30-stock 5.17, W-27, STK-09): the Empties ledger — deposits charged
 * at the till, bottles brought back, crates returned to suppliers and their
 * credit notes — newest first, with what each left in the store. "Held for
 * customers" and "Owed by suppliers" are tabs whose badges are the two deposit
 * balances. Rows grow with every deposit sale, so the loader pages in the
 * database; Kind and Item are passed to it.
 */

const VIEW: ListGrant[] = [["retail.empties", "view"]];
const CREATE: ListGrant[] = [["retail.empties", "create"]];
const UPDATE: ListGrant[] = [["retail.empties", "update"]];

/** The five kinds, as the Kind filter and the state column say them. */
export const EMPTIES_KINDS = [
  { value: "deposit-charged", code: "DEPOSIT_CHARGED", label: "Deposit charged", tone: "hollow" },
  { value: "deposit-refunded", code: "DEPOSIT_REFUNDED", label: "Deposit refunded", tone: "hollow" },
  { value: "bottles-back", code: "BOTTLES_BACK", label: "Bottles back", tone: "ok" },
  { value: "returned", code: "RETURNED_TO_SUPPLIER", label: "Returned to supplier", tone: "info" },
  { value: "credited", code: "CREDIT_RECEIVED", label: "Credit received", tone: "hollow" },
] as const;

const TONES = Object.fromEntries(EMPTIES_KINDS.map((kind) => [kind.label, kind.tone]));
const HELD = ["DEPOSIT_CHARGED", "DEPOSIT_REFUNDED", "BOTTLES_BACK"];
const OWED = ["RETURNED_TO_SUPPLIER", "CREDIT_RECEIVED"];

const empties: ListSpec = {
  noun: "entries",
  sub: "Liquor store · deposits on returnable bottles and crates",
  read: VIEW,
  search: { placeholder: "Customer, supplier or reference", keys: ["who", "reference", "customer", "supplier"] },
  tabs: [
    { key: "ledger", label: "Ledger", where: [] },
    { key: "held", label: "Held for customers", where: [{ column: "kindCode", op: "is", value: HELD }], badge: { sum: "deposit", currency: "USD" } },
    { key: "owed", label: "Owed by suppliers", where: [{ column: "kindCode", op: "is", value: OWED }], badge: { sum: "deposit", currency: "USD" } },
  ],
  filters: [
    {
      key: "kind",
      label: "Kind",
      type: "choice",
      any: "Any",
      primary: true,
      options: EMPTIES_KINDS.map((kind) => ({ value: kind.value, label: kind.label })),
    },
    {
      key: "item",
      label: "Item",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        { value: "bottles", label: "Bottles" },
        { value: "crates", label: "Crates" },
      ],
    },
    { key: "site", label: "Site", type: "choice", any: "All sites", optionsFromLoader: true, column: "siteId", requires: "multi-site" },
    { key: "when", label: "When", type: "period", any: "Any time", column: "day" },
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
    {
      key: "oldest",
      label: "Oldest first",
      rules: [
        { column: "at", dir: "asc" },
        { column: "id", dir: "asc" },
      ],
    },
  ],
  groups: ["kind"],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", sortable: true, width: "140px", align: "start", priority: 1 },
    { key: "kind", label: "What happened", kind: "status", cell: "state", tones: TONES, width: "190px", align: "start", priority: 1 },
    { key: "who", label: "Who", kind: "text", cell: "text", width: "minmax(160px,1.2fr)", align: "start", priority: 1 },
    { key: "bottles", label: "Bottles", kind: "number", cell: "num", sign: "plain", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "crates", label: "Crates", kind: "number", cell: "num", sign: "plain", total: "sum", width: "90px", align: "end", priority: 2 },
    { key: "deposit", label: "Deposit", kind: "money", currency: "USD", cell: "money", width: "120px", align: "end", priority: 1 },
    // The site's own figure in the totals band (the loader's), not a sum of rows.
    { key: "inStore", label: "In the store", kind: "text", cell: "mono", total: "max", width: "120px", align: "end", priority: 2 },
    { key: "site", label: "Site", kind: "text", cell: "muted", requires: "multi-site", hidden: true, width: "140px", align: "start", priority: 3 },
    { key: "reference", label: "Reference", kind: "code", cell: "mono", hidden: true, width: "120px", align: "start", priority: 3 },
  ],
  rowHref: [],
  rowMenu: [
    { key: "open-sale", label: "Open the sale", requires: VIEW, when: [{ column: "saleId", op: "notEmpty" }], do: { href: "/retail/sales/{saleId}" } },
    {
      key: "open-delivery",
      label: "Open the delivery",
      requires: VIEW,
      when: [{ column: "goodsReceiptId", op: "notEmpty" }],
      do: { href: "/retail/buying/deliveries/{goodsReceiptId}" },
    },
    {
      key: "credit",
      label: "Record their credit note",
      requires: UPDATE,
      when: [{ column: "creditable", op: "notEmpty" }],
      do: { sheet: "empties-credit" },
    },
  ],
  bulk: [{ key: "export" }],
  primary: { label: "Return empties to a supplier", icon: "plus", requires: CREATE, sheet: "empties-return" },
  card: { title: "kind", figure: "deposit", meta: "{whenText} · {who}", metaMono: ["whenText"], figure2: "items" },
  empty: {
    icon: "Package",
    title: "No empties yet",
    line: "Deposits charged at the till, bottles brought back and crates returned to suppliers all show here.",
    primary: { label: "Return empties to a supplier", sheet: "empties-return", requires: CREATE },
  },
};

/**
 * Empties as Reports reads them (70-insights-reports 5.14): no "Starts from"
 * card and no built-in; a template can still be saved from it ("Empties owed
 * by supplier", one row for each supplier).
 */
const report: ReportFace = {
  area: "stock",
  noun: "entries",
  read: VIEW,
  search: { placeholder: "Customer, supplier or reference", keys: ["who", "reference", "customer", "supplier"] },
  filters: [
    { key: "when", label: "Period", type: "period", any: "Any time", column: "day", primary: true },
    {
      key: "kind",
      label: "What happened",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        ...EMPTIES_KINDS.map((kind) => ({ value: kind.value, label: kind.label })),
        { value: "supplier", label: "Returns and credits" },
      ],
    },
    { key: "supplier", label: "Supplier", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "supplierId" },
    { key: "site", label: "Shop", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "siteId", requires: "multi-site" },
  ],
  sorts: empties.sorts,
  groups: ["kind", "supplier"],
  columns: [
    { key: "when", label: "When", kind: "date", cell: "when", sortable: true, width: "140px", align: "start", priority: 1 },
    { key: "kind", label: "What happened", kind: "status", cell: "state", tones: TONES, width: "190px", align: "start", priority: 1 },
    { key: "who", label: "Who", kind: "text", cell: "text", width: "minmax(160px,1.2fr)", align: "start", priority: 1 },
    { key: "supplier", label: "Supplier", kind: "text", cell: "text", hidden: true, width: "170px", align: "start", priority: 2 },
    { key: "bottles", label: "Bottles", kind: "number", cell: "num", sign: "plain", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "crates", label: "Crates", kind: "number", cell: "num", sign: "plain", total: "sum", width: "90px", align: "end", priority: 2 },
    { key: "deposit", label: "Deposit", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px", align: "end", priority: 1 },
    { key: "reference", label: "Reference", kind: "code", cell: "ref", width: "120px", align: "start", priority: 2 },
    { key: "day", label: "Day", kind: "date", cell: "date", hidden: true, width: "140px", align: "start", priority: 3 },
    { key: "entries", label: "Entries", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 1 },
  ],
  rowHref: [],
  bulk: [{ key: "export" }],
  card: { title: "kind", figure: "deposit", meta: "{whenText} · {who}", metaMono: ["whenText"], figure2: "items" },
  empty: { icon: "Package", title: "No empties", line: "No deposits, bottles back, returns or credits in this period." },
  rollups: [
    { key: "none", label: "Entry" },
    { key: "supplier", label: "Supplier" },
    { key: "kind", label: "What happened" },
    { key: "day", label: "Day" },
  ],
  rollupOnly: "entries",
};

const emptiesSource: ReportDefinition = {
  key: "retail-empties",
  title: "Empties",
  area: "Stock",
  href: "/retail/stock/empties",
  profiles: ["RETAIL"],
  params: [],
  columns: empties.columns,
  defaults: { sort: empties.sorts[0]!.rules.slice(0, 1) },
  list: empties,
  report,
};

export const EMPTIES_REPORTS: ReportDefinition[] = [emptiesSource];
