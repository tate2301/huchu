import type { ListColumn, ListGrant, ListSpec, ReportDefinition, ReportFace } from "@/lib/reports/types";
import { COVER_WARN_PCT } from "@/lib/retail/products/figures";
import { STOCK_LEVEL_LABEL, STOCK_LEVEL_TONE } from "@/lib/retail/stock/levels";

/**
 * On hand (30-stock 5.1, W-21; board StockList): how much of each product
 * every site holds, its level by STK-01's rule, how long it lasts and what it
 * is worth at cost. One row per stock line; a shop with one site never sees
 * the word "Site". Least cover first: what runs out soonest is on top.
 */

const VIEW: ListGrant[] = [["retail.stock", "view"]];
const UPDATE: ListGrant[] = [["retail.stock", "update"]];
const COUNT: ListGrant[] = [["retail.counts", "create"]];
const level = (key: keyof typeof STOCK_LEVEL_LABEL) => [{ column: "level", op: "is" as const, value: [STOCK_LEVEL_LABEL[key]] }];

const onHand: ListSpec = {
  noun: "stock",
  read: VIEW,
  search: { placeholder: "Name, code or barcode", keys: ["product", "code", "barcode"] },
  tabs: [
    { key: "all", label: "All", where: [] },
    { key: "low", label: "Low", where: level("LOW") },
    { key: "out", label: "Out", where: level("OUT") },
    { key: "toomuch", label: "Too much", where: level("TOO_MUCH") },
  ],
  filters: [
    { key: "category", label: "Category", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "categoryId" },
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
    // Offered with more than one place to be in (two sites, or a back store).
    { key: "place", label: "Place", type: "choice", any: "Anywhere", optionsFromLoader: true, column: "placeId", hideBelow: 2 },
    {
      key: "archived",
      label: "Archived",
      type: "choice",
      any: "Show archived",
      options: [{ value: "hide", label: "Hide archived", where: [{ column: "state", op: "is", value: ["Selling"] }] }],
    },
  ],
  sorts: [
    {
      key: "least-cover",
      label: "Least cover first",
      rules: [
        { column: "coverRank", dir: "asc" },
        { column: "product", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "product", dir: "asc" }] },
    {
      key: "most-value",
      label: "Most value first",
      rules: [
        { column: "value", dir: "desc" },
        { column: "product", dir: "asc" },
      ],
    },
    {
      key: "most-on-hand",
      label: "Most on hand",
      rules: [
        { column: "onHand", dir: "desc" },
        { column: "product", dir: "asc" },
      ],
    },
  ],
  groups: ["level", "category", "site"],
  columns: [
    {
      key: "product",
      label: "Product",
      kind: "text",
      cell: "link",
      href: "/retail/products/{productId}",
      width: "minmax(190px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "code", label: "Code", kind: "code", cell: "mono", width: "130px", align: "start", priority: 2 },
    {
      key: "level",
      label: "Level",
      kind: "status",
      cell: "state",
      tones: {
        [STOCK_LEVEL_LABEL.OUT]: STOCK_LEVEL_TONE.OUT,
        [STOCK_LEVEL_LABEL.LOW]: STOCK_LEVEL_TONE.LOW,
        [STOCK_LEVEL_LABEL.FINE]: STOCK_LEVEL_TONE.FINE,
        [STOCK_LEVEL_LABEL.TOO_MUCH]: STOCK_LEVEL_TONE.TOO_MUCH,
      },
      width: "110px",
      align: "start",
      priority: 1,
    },
    { key: "site", label: "Site", kind: "text", cell: "muted", requires: "multi-site", width: "140px", align: "start", priority: 3 },
    {
      key: "onHand",
      label: "On hand",
      kind: "number",
      cell: "num",
      unitKey: "unitWord",
      sortable: true,
      width: "110px",
      align: "end",
      priority: 1,
    },
    { key: "reorderAt", label: "Reorder at", kind: "number", cell: "num", width: "90px", align: "end", priority: 2 },
    {
      key: "cover",
      label: "Cover",
      kind: "text",
      cell: "bar",
      bar: { pctKey: "coverPct", warnBelow: COVER_WARN_PCT },
      width: "130px",
      align: "start",
      priority: 2,
    },
    {
      key: "value",
      label: "Value at cost",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      requires: "view-cost",
      sortable: true,
      width: "130px",
      align: "end",
      priority: 1,
    },
    // Not drawn: the category's name (Group by category, exports) and the phone card's figure.
    { key: "category", label: "Category", kind: "text", cell: "text", hidden: true, width: "120px", align: "start", priority: 3 },
    { key: "onHandLabel", label: "On hand, in words", kind: "text", cell: "mono", hidden: true, width: "110px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/products/{productId}",
  rowMenu: [
    { key: "open", label: "Open the product", requires: VIEW, do: { href: "/retail/products/{productId}" } },
    {
      key: "adjust",
      label: "Adjust stock",
      requires: [["retail.adjustments", "create"]],
      do: { href: "/retail/stock?sheet=stock-adjust&productId={productId}&siteId={siteId}" },
    },
    {
      key: "move",
      label: "Move to another site",
      requires: [["retail.transfers", "create"]],
      sites: "multi-site",
      do: { sheet: "transfer-new" },
    },
    { key: "reorder", label: "Change reorder level", requires: UPDATE, do: { sheet: "reorder-levels" } },
    { key: "count", label: "Count it", requires: COUNT, do: { sheet: "count-new" } },
  ],
  bulk: [
    {
      key: "move",
      label: "Move to another site",
      requires: [["retail.transfers", "create"]],
      sites: "multi-site",
      do: { sheet: "transfer-new" },
    },
    { key: "reorder", label: "Change reorder level", requires: UPDATE, do: { sheet: "reorder-levels" } },
    { key: "count", label: "Count these", requires: COUNT, do: { sheet: "count-new" } },
    { key: "export" },
  ],
  primary: { label: "Add a product", icon: "plus", requires: [["retail.catalog", "create"]], sheet: "product-new" },
  card: { title: "product", badge: "level", figure: "onHandLabel", meta: "{cardMeta}", figure2: "value" },
  empty: {
    icon: "Stack",
    title: "What is on the shelf?",
    line: "Add a product and it is stock at once; deliveries and counts keep it true.",
    steps: [
      ["Add a product with its opening stock.", "Cost and reorder level can come later."],
      ["Receive deliveries against orders.", "Each one adds to what is here."],
      ["Count a shelf now and then.", "Differences wait for your approval."],
    ],
    primary: { label: "Add a product", sheet: "product-new", requires: [["retail.catalog", "create"]] },
    secondary: { label: "Import a spreadsheet", href: "/retail/products/import", requires: [["retail.catalog", "create"]] },
  },
};

const money = (key: string, label: string, extra: Partial<ListColumn> = {}): ListColumn => ({
  key,
  label,
  kind: "money",
  currency: "USD",
  cell: "money",
  total: "sum",
  sortable: true,
  width: "140px",
  align: "end",
  priority: 1,
  ...extra,
});

/**
 * Stock on hand as Reports reads it (70-insights-reports 5.14): each product at
 * each shop, at cost and at the default price list's price, with no period.
 */
const report: ReportFace = {
  area: "stock",
  startsFrom: { title: "Stock on hand", sub: "Each product at each shop" },
  noun: "stock lines",
  read: VIEW,
  search: { placeholder: "Product, code or barcode", keys: ["product", "code", "barcode"] },
  filters: [
    {
      key: "site",
      label: "Shop",
      type: "choice",
      any: "Any",
      primary: true,
      optionsFromLoader: true,
      column: "siteId",
      requires: "multi-site",
    },
    { key: "category", label: "Category", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "categoryId" },
    {
      key: "level",
      label: "Level",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        { value: "out", label: STOCK_LEVEL_LABEL.OUT, where: level("OUT") },
        { value: "low", label: STOCK_LEVEL_LABEL.LOW, where: level("LOW") },
        { value: "toomuch", label: STOCK_LEVEL_LABEL.TOO_MUCH, where: level("TOO_MUCH") },
        { value: "fine", label: "In stock", where: level("FINE") },
      ],
    },
  ],
  sorts: [
    {
      key: "most-value",
      label: "Most value first",
      rules: [
        { column: "value", dir: "desc" },
        { column: "product", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "product", dir: "asc" }] },
    {
      key: "least-cover",
      label: "Least cover first",
      rules: [
        { column: "coverRank", dir: "asc" },
        { column: "product", dir: "asc" },
      ],
    },
  ],
  groups: ["site", "category", "level"],
  columns: [
    {
      key: "product",
      label: "Product",
      kind: "text",
      cell: "link",
      href: "/retail/products/{productId}",
      width: "minmax(180px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "code", label: "Code", kind: "code", cell: "mono", hidden: true, width: "130px", align: "start", priority: 2 },
    { key: "category", label: "Category", kind: "text", cell: "muted", width: "140px", align: "start", priority: 2 },
    { key: "site", label: "Shop", kind: "text", cell: "text", requires: "multi-site", width: "160px", align: "start", priority: 2 },
    { key: "onHand", label: "On hand", kind: "number", cell: "num", total: "sum", sortable: true, width: "100px", align: "end", priority: 1 },
    { key: "reorderAt", label: "Reorder at", kind: "number", cell: "num", hidden: true, width: "100px", align: "end", priority: 3 },
    money("unitCost", "Unit cost", { total: undefined, hidden: true, requires: "view-cost", width: "110px", priority: 3 }),
    money("value", "Value at cost", { requires: "view-cost" }),
    money("price", "Price", { total: undefined, hidden: true, width: "110px", priority: 3 }),
    money("valueAtPrice", "Value at price"),
    {
      key: "level",
      label: "Level",
      kind: "status",
      cell: "state",
      hidden: true,
      tones: onHand.columns.find((column) => column.key === "level")!.tones,
      width: "110px",
      align: "start",
      priority: 2,
    },
    { key: "products", label: "Products", kind: "number", cell: "num", total: "sum", width: "100px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/products/{productId}",
  bulk: [{ key: "export" }],
  card: { title: "product", badge: "level", figure: "onHandLabel", meta: "{site}", figure2: "valueAtPrice" },
  empty: { icon: "Stack", title: "Nothing on the shelf", line: "Products show here once they have stock at a shop." },
  rollups: [
    { key: "none", label: "Product at a shop" },
    { key: "product", label: "Product" },
    { key: "category", label: "Category" },
    { key: "site", label: "Shop" },
  ],
  rollupOnly: "products",
};

const onHandSource: ReportDefinition = {
  key: "retail-stock-on-hand",
  title: "On hand",
  area: "Stock",
  href: "/retail/stock",
  profiles: ["RETAIL"],
  params: [],
  columns: onHand.columns,
  // The report view sorts by drawn columns; the list's own "Least cover first" ranks by a row field.
  defaults: { sort: onHand.sorts[1]!.rules },
  list: onHand,
  report,
};

export const STOCK_ON_HAND_REPORTS: ReportDefinition[] = [onHandSource];
