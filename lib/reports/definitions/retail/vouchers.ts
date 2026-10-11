import type { ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Vouchers (PRD-10, 20-products 5.23, `VouchersList.png`): gift vouchers,
 * credit notes and discount vouchers, each with who holds it, what it was
 * worth, what is left and when it expires (warned within 31 days), its
 * columns inside the 1144px a 1440 screen leaves beside the sidebar; and a
 * voucher record's Uses tab, where it was spent.
 */

const VIEW: ListGrant[] = [["retail.promotions", "view"]];
const CREATE: ListGrant[] = [["retail.promotions", "create"]];
const UPDATE: ListGrant[] = [["retail.promotions", "update"]];
const DELETE: ListGrant[] = [["retail.promotions", "delete"]];

/** Not voided and not lapsed: it can still be extended, sent or voided. */
const OPEN = { column: "openKey", op: "is" as const, value: ["yes"] };
const SENDABLE = { column: "sendKey", op: "is" as const, value: ["yes"] };

const vouchers: ListSpec = {
  noun: "vouchers",
  read: VIEW,
  search: { placeholder: "Code or customer", keys: ["code", "holder"] },
  tabs: [
    { key: "live", label: "Live", where: [{ column: "stateKey", op: "is", value: ["LIVE", "IN_USE"] }] },
    { key: "usedup", label: "Used up", where: [{ column: "stateKey", op: "is", value: ["USED_UP"] }] },
    { key: "expired", label: "Expired", where: [{ column: "stateKey", op: "is", value: ["EXPIRED"] }] },
    // Void ones only here.
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    {
      key: "kind",
      label: "Kind",
      type: "choice",
      any: "Any",
      column: "kindKey",
      primary: true,
      options: [
        { value: "GIFT", label: "Gift voucher" },
        { value: "CREDIT_NOTE", label: "Credit note" },
        { value: "DISCOUNT", label: "Discount voucher" },
      ],
    },
    {
      key: "expires",
      label: "Expires",
      type: "choice",
      any: "Any time",
      primary: true,
      options: [
        { value: "week", label: "This week", where: [{ column: "inWeek", op: "is", value: ["yes"] }] },
        { value: "month", label: "This month", where: [{ column: "inMonth", op: "is", value: ["yes"] }] },
        { value: "3m", label: "Next 3 months", where: [{ column: "in3m", op: "is", value: ["yes"] }] },
        { value: "past", label: "Already expired", where: [{ column: "past", op: "is", value: ["yes"] }] },
      ],
    },
  ],
  sorts: [
    {
      key: "expiring",
      label: "Expiring soonest",
      rules: [
        { column: "expires", dir: "asc" },
        { column: "code", dir: "asc" },
      ],
    },
    {
      key: "issued",
      label: "Issued, newest",
      rules: [
        { column: "issued", dir: "desc" },
        { column: "code", dir: "desc" },
      ],
    },
    {
      key: "left",
      label: "Most left",
      rules: [
        { column: "leftMoney", dir: "desc" },
        { column: "leftUses", dir: "desc" },
        { column: "code", dir: "asc" },
      ],
    },
  ],
  groups: ["kind"],
  columns: [
    { key: "code", label: "Code", kind: "code", cell: "ref", width: "140px", align: "start", priority: 1 },
    {
      key: "kind",
      label: "Kind",
      kind: "status",
      cell: "dot",
      toneKey: "kindTone",
      width: "140px",
      align: "start",
      priority: 1,
      impliedBy: { group: true },
    },
    { key: "holder", label: "Holder", kind: "text", cell: "text", width: "minmax(160px,1.2fr)", align: "start", priority: 1 },
    { key: "value", label: "Value", kind: "text", cell: "mono", width: "100px", align: "end", priority: 2 },
    {
      key: "left",
      label: "Left",
      kind: "text",
      cell: "mono",
      // "US$74.20 + 12": the money left, then the discount vouchers' uses left.
      total: "sum",
      totalParts: { money: "leftMoney", count: "leftUses" },
      width: "100px",
      align: "end",
      priority: 1,
    },
    { key: "issued", label: "Issued", kind: "date", cell: "date", width: "140px", align: "start", priority: 2 },
    { key: "expires", label: "Expires", kind: "date", cell: "date", pillKey: "expiresTone", width: "140px", align: "start", priority: 1 },
  ],
  rowHref: "/retail/products/vouchers/{id}",
  rowMenu: [
    { key: "extend", label: "Extend", requires: UPDATE, when: [OPEN], do: { sheet: "voucher-extend" } },
    { key: "send", label: "Send to the holder", requires: UPDATE, when: [OPEN, SENDABLE], do: { run: "sendvoucher", endpoint: "/api/v2/retail/vouchers/{id}/send" } },
    { key: "void", label: "Void it", tone: "bad", separated: true, requires: DELETE, when: [OPEN], do: { run: "voidvoucher", endpoint: "/api/v2/retail/vouchers/void" } },
  ],
  bulk: [
    { key: "extend", label: "Extend", requires: UPDATE, when: [OPEN], do: { sheet: "voucher-extend" } },
    { key: "void", label: "Void", tone: "bad", requires: DELETE, when: [OPEN], do: { run: "voidvoucher", endpoint: "/api/v2/retail/vouchers/void" } },
    { key: "print", label: "Print", requires: UPDATE, do: { download: "/api/v2/retail/vouchers/print", open: true } },
    { key: "export" },
  ],
  primary: { label: "Issue vouchers", icon: "plus", sheet: "voucher-new", requires: CREATE },
  card: { title: "code", badge: "kind", figure: "left", meta: "{holder} · expires {expiresText}", metaMono: ["expiresText"] },
  empty: {
    icon: "Ticket",
    title: "No vouchers yet",
    line: "Gift vouchers, credit notes and discount vouchers, each with what is left on it and where it was spent.",
    primary: { label: "Issue vouchers", sheet: "voucher-new", requires: CREATE },
  },
};

/** Where a voucher was spent: the sale, when, the till, what came off and what was left after. */
const voucherUses: ListSpec = {
  noun: "uses",
  read: VIEW,
  search: { placeholder: "Sale or till", keys: ["saleNo", "till"] },
  filters: [{ key: "voucher", type: "parent", column: "voucherId" }],
  sorts: [
    {
      key: "oldest",
      label: "Oldest first",
      rules: [
        { column: "at", dir: "asc" },
        { column: "saleNo", dir: "asc" },
      ],
    },
  ],
  columns: [
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "at", label: "When", kind: "date", cell: "date", width: "170px", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "text", width: "120px", align: "start", priority: 2 },
    { key: "spent", label: "Spent", kind: "money", currency: "USD", cell: "money", total: "sum", width: "100px", align: "end", priority: 1 },
    { key: "leftAfter", label: "Left after", kind: "money", currency: "USD", cell: "money", width: "110px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  card: { title: "saleNo", figure: "spent", meta: "{whenText} · {till}" },
  empty: { icon: "Receipt", title: "Not spent yet", line: "Every sale it pays for shows here." },
};

function source(key: string, title: string, list: ListSpec): ReportDefinition {
  return {
    key,
    title,
    area: "Products",
    href: "/retail/products/vouchers",
    profiles: ["RETAIL"],
    params: [],
    columns: list.columns,
    defaults: { sort: list.sorts[0]!.rules },
    list,
  };
}

export const VOUCHER_REPORTS: ReportDefinition[] = [
  source("retail-vouchers", "Vouchers", vouchers),
  source("retail-voucher-uses", "Where a voucher was spent", voucherUses),
];
