import type { ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Bundles and packs (PRD-08, 20-products 5.12, `BundlesList.png`): the cases
 * the shop sells as products of their own, its bundles of different products
 * and its buy-more deals, in one list; and a bundle record's two tabs, what
 * is in it and every sale of it.
 */

const VIEW: ListGrant[] = [["retail.promotions", "view"]];
const CREATE: ListGrant[] = [["retail.promotions", "create"]];
const UPDATE: ListGrant[] = [["retail.promotions", "update"]];
const LABELS: ListGrant[] = [
  ["retail.catalog", "update"],
  ["retail.adjustments", "create"],
];

const bundles: ListSpec = {
  noun: "bundles and packs",
  read: VIEW,
  search: { placeholder: "Name or barcode", keys: ["name", "barcode"] },
  tabs: [
    { key: "all", label: "All", where: [] },
    {
      key: "packs",
      label: "Packs",
      where: [
        { column: "kindKey", op: "is", value: ["PACK"] },
        { column: "stateKey", op: "isNot", value: ["STOPPED"] },
      ],
    },
    {
      key: "bundles",
      label: "Bundles",
      where: [
        { column: "kindKey", op: "is", value: ["FIXED_SET"] },
        { column: "stateKey", op: "isNot", value: ["STOPPED"] },
      ],
    },
    {
      key: "buymore",
      label: "Buy more, pay less",
      where: [
        { column: "kindKey", op: "is", value: ["BUY_MORE"] },
        { column: "stateKey", op: "isNot", value: ["STOPPED"] },
      ],
    },
  ],
  filters: [
    {
      // Not "kind": that is New bundle's own address (`?sheet=bundle-new&kind=…`) over this list.
      key: "of",
      label: "Kind",
      type: "choice",
      any: "Any",
      column: "kindKey",
      primary: true,
      options: [
        { value: "PACK", label: "Pack" },
        { value: "FIXED_SET", label: "Bundle" },
        { value: "BUY_MORE", label: "Buy more, pay less" },
      ],
    },
    { key: "category", label: "Category", type: "choice", any: "Any", optionsFromLoader: true, column: "categoryId", primary: true },
  ],
  sorts: [
    {
      key: "most-sold",
      label: "Most sold",
      rules: [
        { column: "kindRank", dir: "asc" },
        { column: "sold30", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "saves",
      label: "Saves the most",
      rules: [
        { column: "saves", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["kind"],
  columns: [
    {
      key: "name",
      label: "Name",
      kind: "text",
      cell: "link",
      strong: true,
      width: "minmax(180px,1.3fr)",
      align: "start",
      priority: 1,
    },
    {
      key: "kind",
      label: "Kind",
      kind: "status",
      cell: "state",
      tones: { Pack: "hollow", Bundle: "hollow", "Buy more, pay less": "hollow", Paused: "warn", Stopped: "neutral" },
      width: "130px",
      align: "start",
      priority: 1,
    },
    { key: "madeOf", label: "Made of", kind: "text", cell: "muted", width: "minmax(180px,1.4fr)", align: "start", priority: 2 },
    { key: "price", label: "Price", kind: "money", currency: "USD", cell: "money", width: "100px", align: "end", priority: 1 },
    { key: "onTheirOwn", label: "On their own", kind: "money", currency: "USD", cell: "zero", width: "110px", align: "end", priority: 3 },
    { key: "saves", label: "Saves", kind: "money", currency: "USD", cell: "num", pillKey: "savesTone", width: "90px", align: "end", priority: 1 },
    {
      key: "canMake",
      label: "Can make",
      kind: "number",
      cell: "num",
      pillKey: "canMakeTone",
      empty: "dash",
      width: "100px",
      align: "end",
      priority: 2,
    },
    { key: "sold30", label: "Sold, 30 days", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "barcode", label: "Barcode", kind: "text", cell: "mono", hidden: true, width: "130px", align: "start", priority: 3 },
    { key: "category", label: "Category", kind: "text", cell: "muted", hidden: true, width: "130px", align: "start", priority: 3 },
    { key: "kindRank", label: "Order", kind: "number", cell: "num", hidden: true, width: "60px", align: "end", priority: 3 },
  ],
  rowHref: ["/retail/products/{packId}", "/retail/products/bundles/{bundleId}"],
  rowMenu: [
    {
      key: "change-pack",
      label: "Change it",
      requires: [["retail.catalog", "update"]],
      when: [{ column: "kindKey", op: "is", value: ["PACK"] }],
      do: { sheet: "product-edit" },
    },
    {
      key: "change",
      label: "Change it",
      requires: UPDATE,
      when: [
        { column: "kindKey", op: "isNot", value: ["PACK"] },
        { column: "stateKey", op: "isNot", value: ["STOPPED"] },
      ],
      do: { sheet: "bundle-edit" },
    },
    {
      key: "pause",
      label: "Pause",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["ON_SALE"] }],
      do: { run: "bundlepause", endpoint: "/api/v2/retail/bundles/pause" },
    },
    {
      key: "resume",
      label: "Put on sale",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["PAUSED"] }],
      do: { run: "bundleresume", endpoint: "/api/v2/retail/bundles/resume" },
    },
    { key: "labels", label: "Print shelf labels", requires: LABELS, do: { sheet: "labels" } },
  ],
  bulk: [
    {
      key: "pause",
      label: "Pause",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["ON_SALE"] }],
      do: { run: "bundlepause", endpoint: "/api/v2/retail/bundles/pause" },
    },
    {
      key: "resume",
      label: "Put on sale",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["PAUSED"] }],
      do: { run: "bundleresume", endpoint: "/api/v2/retail/bundles/resume" },
    },
    { key: "labels", label: "Print shelf labels", requires: LABELS, do: { sheet: "labels" } },
    {
      key: "duplicate",
      label: "Duplicate",
      requires: CREATE,
      when: [{ column: "kindKey", op: "isNot", value: ["PACK"] }],
      do: { run: "bundleduplicate", endpoint: "/api/v2/retail/bundles/duplicate" },
    },
    { key: "export" },
  ],
  primary: {
    label: "New bundle or pack",
    icon: "plus",
    requires: [...CREATE, ["retail.catalog", "create"]],
    menu: [
      { label: "A pack, like a case or a six-pack", sheet: "pack-new", requires: [["retail.catalog", "create"]] },
      { label: "A bundle of different products", sheet: "bundle-new", params: { kind: "FIXED_SET" }, requires: CREATE },
      { label: "Buy more, pay less", sheet: "bundle-new", params: { kind: "BUY_MORE" }, requires: CREATE },
    ],
  },
  card: { title: "name", badge: "kind", figure: "price", meta: "{cardMeta}" },
  empty: {
    icon: "Package",
    title: "Sell more than one at a time",
    line: "Packs sell a case or a six-pack at its own price. Bundles put different products together. Buy more, pay less takes money off when they buy enough.",
    primary: { label: "New bundle or pack", sheet: "bundle-new", requires: CREATE },
  },
};

const BUNDLE_PARENT: ListSpec["filters"][number] = { key: "bundle", type: "parent", column: "bundleId" };

/** What is in it: each product, how many, their own price, on hand and how many bundles that makes. */
const bundleItems: ListSpec = {
  noun: "products",
  read: VIEW,
  search: { placeholder: "Product", keys: ["product"] },
  filters: [BUNDLE_PARENT],
  sorts: [{ key: "order", label: "As made", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "product", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "quantity", label: "Quantity", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 1 },
    { key: "onTheirOwn", label: "On their own", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px", align: "end", priority: 1 },
    { key: "onHand", label: "On hand", kind: "number", cell: "num", pillKey: "limitTone", width: "100px", align: "end", priority: 1 },
    { key: "makes", label: "Makes", kind: "number", cell: "num", pillKey: "limitTone", total: "min", empty: "dash", width: "100px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/products/{productId}",
  card: { title: "product", figure: "onTheirOwn", meta: "{quantity} · {onHand} on hand" },
  empty: { icon: "Package", title: "Nothing in it", line: "Change the bundle to put products in it." },
};

/** Every sale of it: when, the sale, the till, what it sold at and what the customer saved. */
const bundleSales: ListSpec = {
  noun: "sales",
  read: VIEW,
  search: { placeholder: "Sale or till", keys: ["saleNo", "till"] },
  filters: [BUNDLE_PARENT],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "at", dir: "desc" },
        { column: "id", dir: "desc" },
      ],
    },
  ],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", width: "120px", align: "start", priority: 1 },
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "120px", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "muted", width: "minmax(80px,1fr)", align: "start", priority: 2 },
    { key: "price", label: "Price", kind: "money", currency: "USD", cell: "money", total: "sum", width: "110px", align: "end", priority: 1 },
    { key: "saved", label: "Saved", kind: "money", currency: "USD", cell: "zero", total: "sum", width: "100px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  card: { title: "saleNo", figure: "price", meta: "{whenText} · {till}" },
  empty: { icon: "Receipt", title: "Not sold yet", line: "Every sale of it shows here." },
};

/** A record tab's source sorts by its own first sort; the list has a default. */
function source(key: string, title: string, list: ListSpec, sorted = false): ReportDefinition {
  return {
    key,
    title,
    area: "Products",
    href: "/retail/products/bundles",
    profiles: ["RETAIL"],
    params: [],
    columns: list.columns,
    defaults: sorted ? { sort: list.sorts[0]!.rules } : {},
    list,
  };
}

export const BUNDLE_REPORTS: ReportDefinition[] = [
  source("retail-bundles", "Bundles and packs", bundles, true),
  source("retail-bundle-items", "What is in a bundle", bundleItems),
  source("retail-bundle-sales", "Sales of a bundle", bundleSales),
];
