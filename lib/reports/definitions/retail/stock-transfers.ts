import type { ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Transfers (30-stock 5.12, W-24): stock sent between the shop's sites, on the
 * way until the other site receives it. Opens on "On the way" (part received
 * included); "All" adds the cancelled. Value is at cost, so it is dropped for
 * roles that may not see cost. The list, its page and its nav item exist only
 * while the shop has two open sites.
 */

const VIEW: ListGrant[] = [["retail.transfers", "view"]];
const CREATE: ListGrant[] = [["retail.transfers", "create"]];
const UPDATE: ListGrant[] = [["retail.transfers", "update"]];
const CANCEL: ListGrant[] = [["retail.transfers", "delete"]];
const ON_THE_WAY = [{ column: "status", op: "is" as const, value: ["ON_THE_WAY"] }];
const PRINT = { download: "/api/v2/retail/stock/transfers/print", open: true } as const;

const transfers: ListSpec = {
  noun: "transfers",
  read: VIEW,
  multiSiteOnly: { refusal: "Transfers need a second site." },
  // `products` (every line's product name) is a row field, not a column: a hidden column's key is not searched.
  search: { placeholder: "Transfer or product", keys: ["transferNo", "products"] },
  tabs: [
    { key: "on-the-way", label: "On the way", where: ON_THE_WAY },
    { key: "received", label: "Received", where: [{ column: "status", op: "is", value: ["RECEIVED"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    { key: "from", label: "From", type: "choice", any: "Any site", primary: true, optionsFromLoader: true, column: "fromId" },
    { key: "to", label: "To", type: "choice", any: "Any site", primary: true, optionsFromLoader: true, column: "toId" },
  ],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "sentAt", dir: "desc" },
        { column: "transferNo", dir: "desc" },
      ],
    },
    {
      key: "oldest",
      label: "Oldest first",
      rules: [
        { column: "sentAt", dir: "asc" },
        { column: "transferNo", dir: "asc" },
      ],
    },
    {
      key: "value",
      label: "Most value",
      rules: [
        { column: "value", dir: "desc" },
        { column: "sentAt", dir: "desc" },
      ],
    },
  ],
  groups: ["state", "from", "to"],
  columns: [
    {
      key: "transferNo",
      label: "Transfer",
      kind: "code",
      cell: "ref",
      href: "/retail/stock/transfers/{id}",
      width: "110px",
      align: "start",
      priority: 1,
    },
    { key: "from", label: "From", kind: "text", cell: "text", width: "170px", align: "start", priority: 1 },
    { key: "to", label: "To", kind: "text", cell: "text", width: "170px", align: "start", priority: 1 },
    { key: "lines", label: "Lines", kind: "number", cell: "num", total: "sum", width: "110px", align: "end", priority: 2 },
    {
      key: "value",
      label: "Value",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      requires: "view-cost",
      width: "130px",
      align: "end",
      priority: 1,
    },
    { key: "sent", label: "Sent", kind: "text", cell: "text", width: "140px", align: "start", priority: 2 },
    { key: "state", label: "State", kind: "status", cell: "state", toneKey: "tone", width: "150px", align: "start", priority: 1 },
    // Not drawn: when it left to the minute (sorts and exports), the units, and the phone card's title and figure.
    { key: "sentAt", label: "Sent at", kind: "date", cell: "when", sortable: true, hidden: true, width: "140px", align: "start", priority: 3 },
    { key: "units", label: "Units", kind: "number", cell: "num", total: "sum", hidden: true, width: "90px", align: "end", priority: 3 },
    { key: "route", label: "From and to", kind: "text", cell: "text", hidden: true, width: "minmax(200px,1fr)", align: "start", priority: 3 },
    { key: "figure", label: "Value or units", kind: "text", cell: "mono", hidden: true, width: "110px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/stock/transfers/{id}",
  rowMenu: [
    { key: "open", label: "Open", requires: VIEW, do: { href: "/retail/stock/transfers/{id}" } },
    {
      key: "receive",
      label: "Receive it",
      requires: UPDATE,
      when: ON_THE_WAY,
      do: { href: "/retail/stock/transfers/{id}?sheet=transfer-receive&id={id}" },
    },
    { key: "print", label: "Print delivery note", requires: VIEW, do: PRINT },
    {
      key: "cancel",
      label: "Cancel the transfer",
      tone: "bad",
      separated: true,
      requires: CANCEL,
      when: ON_THE_WAY,
      do: { run: "canceltransfers", endpoint: "/api/v2/retail/stock/transfers/cancel" },
    },
  ],
  bulk: [
    { key: "print", label: "Print delivery notes", requires: VIEW, do: { ...PRINT, cap: 200 } },
    {
      key: "cancel",
      label: "Cancel",
      tone: "bad",
      requires: CANCEL,
      do: { run: "canceltransfers", endpoint: "/api/v2/retail/stock/transfers/cancel" },
    },
    { key: "export" },
  ],
  primary: { label: "Move stock", icon: "plus", requires: CREATE, sheet: "transfer-new" },
  card: { title: "route", badge: "state", figure: "figure", meta: "{transferNo} · {sent}", figure2: "lines" },
  empty: {
    icon: "ArrowsLeftRight",
    title: "Nothing has moved between sites yet",
    line: "Send stock to another site and it shows here until they receive it.",
    primary: { label: "Move stock", sheet: "transfer-new", requires: CREATE },
  },
  catalog: false,
};

const transfersSource: ReportDefinition = {
  key: "retail-stock-transfers",
  title: "Transfers",
  area: "Stock",
  href: "/retail/stock/transfers",
  profiles: ["RETAIL"],
  params: [],
  columns: transfers.columns,
  defaults: { sort: transfers.sorts[0]!.rules.slice(0, 1) },
  list: transfers,
};

/**
 * A transfer's Lines tab (30-stock 5.14, `retail-stock-transfer-lines`): what
 * it carries, sent and received, at the cost each line left at. Without a
 * transfer it has no rows: it is a record's table, not a list of its own.
 */
const lines: ListSpec = {
  noun: "lines",
  read: VIEW,
  search: { placeholder: "Product", keys: ["product"] },
  filters: [{ key: "transfer", type: "parent", column: "transferId" }],
  sorts: [{ key: "sent", label: "As sent", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "product", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "sent", label: "Sent", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    // Blank, so "—", until something of the transfer has been received.
    { key: "received", label: "Received", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 2 },
    {
      key: "cost",
      label: "Cost",
      kind: "money",
      currency: "USD",
      cell: "money",
      requires: "view-cost",
      width: "90px",
      align: "end",
      priority: 3,
    },
    {
      key: "value",
      label: "Value",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      requires: "view-cost",
      width: "110px",
      align: "end",
      priority: 1,
    },
    { key: "order", label: "Order", kind: "number", cell: "num", hidden: true, width: "60px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/products/{productId}",
  card: { title: "product", figure: "sent", meta: "{receivedWords}" },
  empty: { icon: "ArrowsLeftRight", title: "Nothing on this transfer", line: "Change the lines to add what goes." },
  catalog: false,
};

const linesSource: ReportDefinition = {
  key: "retail-stock-transfer-lines",
  title: "Lines on a transfer",
  area: "Stock",
  href: "/retail/stock/transfers",
  profiles: ["RETAIL"],
  params: [],
  columns: lines.columns,
  defaults: { sort: lines.sorts[0]!.rules },
  list: lines,
};

export const STOCK_TRANSFER_REPORTS: ReportDefinition[] = [transfersSource, linesSource];
