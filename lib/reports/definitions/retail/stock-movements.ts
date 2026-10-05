import type { ListSpec, ReportDefinition } from "@/lib/reports/types";
import { MOVEMENT_KINDS } from "@/lib/retail/stock/movement-words";

/**
 * Movements (30-stock 5.4, W-28): every in and out of every stock line, with
 * the reason in the shop's words, the document that made it and what it left
 * on the shelf. The same source is the product record's "Stock movements"
 * tab, opened with its `product` parent filter.
 *
 * Rows are many (every sale line is one), so the loader pages in the
 * database. Kind is passed to the loader; Site, By, When and the product are
 * also columns, so the in-memory path an export takes narrows the same way.
 */

const MOVE: ListSpec["read"] = [["retail.stock", "view"]];
const REVERSE: ListSpec["read"] = [["retail.adjustments", "approve"]];

const movements: ListSpec = {
  noun: "movements",
  read: MOVE,
  search: { placeholder: "Product or reference", keys: ["product", "code", "reference"] },
  filters: [
    {
      key: "kind",
      label: "Kind",
      type: "choice",
      any: "Any",
      primary: true,
      options: MOVEMENT_KINDS.map((kind) => ({ value: kind.id.toLowerCase(), label: kind.label })),
    },
    {
      key: "site",
      label: "Site",
      type: "choice",
      any: "All sites",
      primary: true,
      optionsFromLoader: true,
      column: "siteId",
      requires: "multi-site",
    },
    { key: "when", label: "When", type: "period", any: "Any time", column: "day", default: "30d" },
    { key: "by", label: "By", type: "choice", any: "Anyone", optionsFromLoader: true, column: "byId" },
    { key: "product", type: "parent", column: "productId", all: "All products" },
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
    {
      key: "biggest",
      label: "Biggest change",
      rules: [
        { column: "size", dir: "desc" },
        { column: "at", dir: "desc" },
      ],
    },
  ],
  groups: ["movement", "site", "by"],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", sortable: true, width: "150px", align: "start", priority: 1 },
    {
      key: "product",
      label: "Product",
      kind: "text",
      cell: "link",
      href: "/retail/products/{productId}",
      width: "minmax(180px,1.3fr)",
      align: "start",
      priority: 1,
    },
    { key: "movement", label: "Movement", kind: "status", cell: "state", toneKey: "tone", width: "150px", align: "start", priority: 1 },
    {
      key: "reference",
      label: "Reference",
      kind: "code",
      cell: "ref",
      // The document's own page, by reason (W-28 step 2). Only documents that
      // have a page link: adjustments and case breaks are plain mono. The
      // delivery, count and transfer records join here as their units build them.
      href: ["/retail/sales/{saleId}"],
      width: "120px",
      align: "start",
      priority: 1,
    },
    { key: "site", label: "Site", kind: "text", cell: "muted", requires: "multi-site", width: "140px", align: "start", priority: 3 },
    {
      key: "change",
      label: "Change",
      kind: "number",
      cell: "num",
      sign: "gain",
      total: "sum",
      width: "80px",
      align: "end",
      priority: 1,
    },
    { key: "balance", label: "Balance", kind: "number", cell: "num", width: "80px", align: "end", priority: 2 },
    { key: "by", label: "By", kind: "text", cell: "muted", width: "120px", align: "start", priority: 2 },
    // For the product record's tab, which has no Site column, and for exports.
    {
      key: "movementLong",
      label: "Movement, in full",
      kind: "text",
      cell: "dot",
      toneKey: "tone",
      hidden: true,
      width: "minmax(160px,1fr)",
      align: "start",
      priority: 1,
    },
    { key: "in", label: "In", kind: "number", cell: "num", sign: "gain", total: "sum", hidden: true, width: "80px", align: "end", priority: 3 },
    { key: "out", label: "Out", kind: "number", cell: "num", sign: "plain", total: "sum", hidden: true, width: "80px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/products/{productId}",
  rowMenu: [
    {
      key: "open-document",
      label: "Open {reference}",
      requires: MOVE,
      when: [{ column: "saleId", op: "notEmpty" }],
      do: { href: "/retail/sales/{saleId}" },
    },
    { key: "open-product", label: "Open the product", requires: MOVE, do: { href: "/retail/products/{productId}" } },
    {
      key: "reverse",
      label: "Reverse",
      tone: "bad",
      requires: REVERSE,
      when: [{ column: "reversible", op: "notEmpty" }],
      do: { run: "reversemovements", endpoint: "/api/v2/retail/stock/movements/reverse" },
    },
  ],
  bulk: [
    {
      key: "reverse",
      label: "Reverse",
      tone: "bad",
      requires: REVERSE,
      do: { run: "reversemovements", endpoint: "/api/v2/retail/stock/movements/reverse" },
    },
    { key: "print", label: "Print", requires: MOVE, do: { export: "pdf" } },
    { key: "export" },
  ],
  card: { title: "product", badge: "movement", figure: "change", meta: "{whenText} · {reference} · {by}", figure2: "balance" },
  empty: {
    icon: "Clock",
    title: "No movements yet",
    line: "Every sale, delivery, count and transfer shows here with what it left on the shelf.",
  },
  catalog: false,
};

const movementsSource: ReportDefinition = {
  key: "retail-stock-movements",
  title: "Movements",
  area: "Stock",
  href: "/retail/stock/movements",
  profiles: ["RETAIL"],
  params: [],
  columns: movements.columns,
  // The report view sorts by its columns; the id tie-break is the list's own.
  defaults: { sort: movements.sorts[0]!.rules.slice(0, 1) },
  list: movements,
};

export const STOCK_MOVEMENT_REPORTS: ReportDefinition[] = [movementsSource];
