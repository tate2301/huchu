import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * A sale's record tabs (50-floor, SaleRecord board): each a list source opened
 * with its `parent` filter set to the sale, so the tab's table, its totals
 * and its Export are the list engine's. Without a sale they have no rows.
 */

const READ: ListSpec["read"] = [
  ["retail.sell", "view"],
  ["retail.cash-control", "view"],
];

/** A cashier reads the tables of their own sales only, as the sale itself. */
const OWN: ListSpec["scopeOwn"] = { roles: ["CASHIER", "POS_CASHIER"], column: "cashierId" };

const PARENT: ListSpec["filters"] = [{ key: "sale", type: "parent", column: "saleId" }];

const lines: ListSpec = {
  noun: "lines",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Product", keys: ["name"] },
  filters: PARENT,
  sorts: [{ key: "rung", label: "As rung", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "name", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "quantity", label: "Quantity", kind: "number", cell: "num", total: "sum", width: "110px", align: "end", priority: 1 },
    { key: "price", label: "Price", kind: "money", currency: "USD", cell: "money", width: "110px", align: "end", priority: 2 },
    { key: "discount", label: "Discount", kind: "money", currency: "USD", cell: "zero", total: "sum", width: "110px", align: "end", priority: 3 },
    { key: "total", label: "Line", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/products/{productId}",
  card: { title: "name", figure: "total", meta: "{quantityText}" },
  empty: { icon: "Receipt", title: "No lines", line: "What was rung on this sale shows here." },
};

const payments: ListSpec = {
  noun: "payments",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Paid with", keys: ["paidWith"] },
  filters: PARENT,
  sorts: [{ key: "taken", label: "As taken", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "paidWith", label: "Paid with", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "reference", label: "Reference", kind: "text", cell: "mono", width: "180px", align: "start", priority: 2 },
    { key: "currency", label: "Currency", kind: "text", cell: "muted", width: "100px", align: "start", priority: 3 },
    { key: "amount", label: "Amount", kind: "money", currency: "USD", cell: "money", total: "sum", width: "130px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  card: { title: "paidWith", figure: "amount", meta: "{reference}" },
  empty: { icon: "Coins", title: "Nothing taken", line: "How the customer paid shows here." },
};

const receipt: ListSpec = {
  noun: "receipts",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Receipt", keys: ["receipt"] },
  filters: PARENT,
  sorts: [{ key: "first", label: "First first", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "what", label: "What", kind: "text", cell: "text", width: "150px", align: "start", priority: 1 },
    { key: "receipt", label: "Receipt", kind: "text", cell: "mono", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "dayNo", label: "Day", kind: "number", cell: "num", width: "80px", align: "end", priority: 3 },
    { key: "signedAt", label: "Signed", kind: "date", cell: "when", width: "140px", align: "start", priority: 2 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      width: "130px",
      align: "start",
      priority: 1,
      tones: { Signed: "ok", "Waiting for ZIMRA": "warn", "Not signed": "bad" },
    },
  ],
  rowHref: "/retail/sales/{saleId}",
  card: { title: "what", badge: "state", figure: "receipt", meta: "{receipt}" },
  empty: { icon: "Receipt", title: "No fiscal receipt", line: "This shop does not sign its receipts with ZIMRA." },
};

const refunds: ListSpec = {
  noun: "refunds",
  read: READ,
  scopeOwn: OWN,
  search: { placeholder: "Refund", keys: ["saleNo"] },
  filters: PARENT,
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "postedAt", dir: "desc" }] }],
  columns: [
    { key: "saleNo", label: "Refund", kind: "code", cell: "ref", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "postedAt", label: "When", kind: "date", cell: "when", width: "160px", align: "start", priority: 1 },
    { key: "total", label: "Total", kind: "money", currency: "USD", cell: "money", total: "sum", width: "130px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{id}",
  card: { title: "saleNo", figure: "total", meta: "{postedAt}" },
  empty: { icon: "Receipt", title: "No refunds", line: "Refunds of this sale show here." },
};

function source(key: string, title: string, list: ListSpec): ReportDefinition {
  return {
    key,
    title,
    area: "The floor",
    href: "/retail/sales",
    profiles: ["RETAIL"],
    params: [],
    columns: list.columns,
    // The list's own sort orders it (as rung); the order is not a column.
    defaults: {},
    list,
  };
}

export const SALE_RECORD_REPORTS: ReportDefinition[] = [
  source("retail-sale-lines", "Lines on a sale", lines),
  source("retail-sale-payments", "Payments on a sale", payments),
  source("retail-sale-receipt", "A sale's fiscal receipt", receipt),
  source("retail-sale-refunds", "Refunds of a sale", refunds),
];
