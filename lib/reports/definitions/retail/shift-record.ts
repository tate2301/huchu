import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * The shift record's tabs (00-foundations 5.6.5, 5.6.10): each a list source
 * opened with its `parent` filter set to the shift, so the tab's table, its
 * totals and its Export are the list engine's. Without a shift they have no
 * rows: they are a record's tables, not lists of their own.
 */

const READ: ListSpec["read"] = [
  ["retail.cash-control", "view"],
  ["retail.sell", "view"],
];

/** A cashier reads the tables of their own shifts only, as the shift itself. */
const OWN: ListSpec["scopeOwn"] = { roles: ["CASHIER"], column: "cashierId" };

const TENDER_TONES = { Cash: "ok", "Mobile money": "info", Card: "warn", "Bank transfer": "neutral", Voucher: "gold" } as const;
/** A sale's row: how it was paid, or that it was refunded or voided. */
const SALE_TONES = { ...TENDER_TONES, Refund: "bad", Voided: "bad" } as const;

const sales: ListSpec = {
  noun: "sales",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Sale", keys: ["saleNo"] },
  filters: [{ key: "shift", type: "parent", column: "shiftId" }],
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "postedAt", dir: "desc" }] }],
  columns: [
    { key: "postedAt", label: "When", kind: "date", cell: "when", width: "150px", align: "start" },
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", width: "140px", align: "start" },
    { key: "items", label: "Items", kind: "number", cell: "num", total: "sum", width: "80px", align: "end" },
    { key: "paidWith", label: "Paid with", kind: "text", cell: "dot", tones: SALE_TONES, width: "minmax(0,1fr)", align: "start" },
    { key: "total", label: "Total", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px", align: "end" },
  ],
  rowHref: "/retail/sales/{saleId}",
  card: { title: "saleNo", figure: "total", meta: "{paidWith}" },
  empty: { icon: "Receipt", title: "No sales on this shift yet", line: "Sales rung on this till while the shift is open show here." },
};

const cash: ListSpec = {
  noun: "cash movements",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Note", keys: ["note"] },
  filters: [{ key: "shift", type: "parent", column: "shiftId" }],
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "at", dir: "desc" }] }],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", width: "150px", align: "start" },
    { key: "what", label: "What", kind: "text", cell: "dot", width: "160px", align: "start" },
    { key: "note", label: "Note", kind: "text", cell: "muted", width: "minmax(0,1fr)", align: "start" },
    { key: "by", label: "By", kind: "text", cell: "text", width: "140px", align: "start" },
    { key: "amount", label: "Amount", kind: "money", currency: "USD", cell: "diff", diff: "gain", total: "sum", width: "120px", align: "end" },
  ],
  rowHref: "/retail/shifts/{shiftId}",
  card: { title: "what", figure: "amount", meta: "{by}" },
  empty: { icon: "Coins", title: "No cash in or out", line: "Drops to the safe, top-ups and payouts on this shift show here." },
};

const tenders: ListSpec = {
  noun: "ways people paid",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Paid with", keys: ["paidWith"] },
  filters: [{ key: "shift", type: "parent", column: "shiftId" }],
  sorts: [{ key: "most", label: "Most taken", rules: [{ column: "amount", dir: "desc" }] }],
  columns: [
    { key: "paidWith", label: "Paid with", kind: "text", cell: "dot", tones: TENDER_TONES, width: "minmax(0,1fr)", align: "start" },
    { key: "sales", label: "Sales", kind: "number", cell: "num", total: "sum", width: "100px", align: "end" },
    { key: "amount", label: "Amount", kind: "money", currency: "USD", cell: "money", total: "sum", width: "140px", align: "end" },
    { key: "share", label: "Share", kind: "text", cell: "mono", width: "100px", align: "end" },
  ],
  rowHref: "/retail/shifts/{shiftId}",
  card: { title: "paidWith", figure: "amount", meta: "{share}" },
  empty: { icon: "Coins", title: "Nobody has paid yet", line: "Each way people paid on this shift, once a sale is rung." },
};

function source(key: string, title: string, list: ListSpec): ReportDefinition {
  return {
    key,
    title,
    area: "The floor",
    href: "/retail/shifts",
    profiles: ["RETAIL"],
    params: [],
    columns: list.columns,
    defaults: { sort: list.sorts[0]!.rules },
    list,
  };
}

export const SHIFT_RECORD_REPORTS: ReportDefinition[] = [
  source("retail-shift-sales", "Sales on a shift", sales),
  source("retail-shift-cash", "Cash in and out on a shift", cash),
  source("retail-shift-tenders", "How people paid on a shift", tenders),
];
