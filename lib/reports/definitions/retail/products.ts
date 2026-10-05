import type { ListSpec, ReportDefinition } from "@/lib/reports/types";
import { COVER_WARN_PCT } from "@/lib/retail/products/figures";

/**
 * Products' lists (20-products 4.1, 5.1).
 *
 * Products is the shop's range: what is selling, what is running low, what it
 * stopped selling. Its figures are the 30 days ending now — on hand, units
 * sold and how many days the stock lasts at that rate — and the price on the
 * default list.
 *
 * The bulk actions and row items that open sheets other units build (Change
 * prices, Print shelf labels, Add to an order, Add to a price list, Edit,
 * Adjust stock) join this file with their sheets; until then the list offers
 * what works today: stop selling, sell again and export.
 */

const products: ListSpec = {
  noun: "products",
  read: [["retail.catalog", "view"]],
  search: { placeholder: "Name, code or barcode", keys: ["name", "code", "barcode"] },
  tabs: [
    { key: "selling", label: "Selling", where: [{ column: "state", op: "is", value: ["Selling"] }] },
    {
      key: "low",
      label: "Low stock",
      where: [
        { column: "state", op: "is", value: ["Selling"] },
        { column: "stock", op: "is", value: ["Low", "Out"] },
      ],
    },
    { key: "archived", label: "Archived", where: [{ column: "state", op: "is", value: ["Archived"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    {
      key: "category",
      label: "Category",
      type: "choice",
      any: "Any",
      optionsFromLoader: true,
      column: "categoryId",
      primary: true,
    },
    {
      key: "stock",
      label: "Stock",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        { value: "in-stock", label: "In stock", where: [{ column: "onHand", op: "gt", value: "0" }] },
        { value: "low", label: "Low", where: [{ column: "stock", op: "is", value: ["Low"] }] },
        { value: "out", label: "Out of stock", where: [{ column: "stock", op: "is", value: ["Out"] }] },
      ],
    },
    // Passed to the loader: on hand and sales become that site's.
    { key: "site", label: "Site", type: "choice", any: "All sites", optionsFromLoader: true, hideBelow: 2 },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "most-sold",
      label: "Most sold",
      rules: [
        { column: "sold30", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "least-cover",
      label: "Least cover first",
      rules: [
        { column: "coverDays", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "price",
      label: "Price, highest first",
      rules: [
        { column: "price", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["category"],
  columns: [
    {
      key: "name",
      label: "Product",
      kind: "text",
      cell: "link",
      sortable: true,
      width: "minmax(190px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "code", label: "Code", kind: "code", cell: "mono", width: "130px", align: "start", priority: 2 },
    { key: "category", label: "Category", kind: "text", cell: "muted", width: "120px", align: "start", priority: 3 },
    {
      key: "onHand",
      label: "On hand",
      kind: "number",
      cell: "num",
      unitKey: "unitWord",
      width: "110px",
      align: "end",
      priority: 1,
    },
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
    { key: "price", label: "Price", kind: "money", currency: "USD", cell: "money", width: "100px", align: "end", priority: 1 },
    {
      key: "sold30",
      label: "Sold, 30 days",
      kind: "number",
      cell: "num",
      total: "sum",
      sortable: true,
      width: "80px",
      align: "end",
      priority: 1,
    },
    { key: "vat", label: "VAT", kind: "text", cell: "mono", width: "60px", align: "end", priority: 3 },
    {
      key: "flag",
      label: "State",
      kind: "status",
      cell: "state",
      hidden: true,
      tones: { Out: "bad", Low: "warn", Archived: "neutral" },
      width: "104px",
      align: "start",
      priority: 3,
    },
  ],
  rowHref: "/retail/products/{id}",
  rowMenu: [
    {
      key: "archive",
      label: "Stop selling it",
      requires: [["retail.catalog", "update"]],
      when: [{ column: "flag", op: "isNot", value: ["Archived"] }],
      do: { run: "archive", endpoint: "/api/v2/retail/products/archive" },
    },
    {
      key: "unarchive",
      label: "Sell it again",
      requires: [["retail.catalog", "update"]],
      when: [{ column: "flag", op: "is", value: ["Archived"] }],
      do: { run: "unarchive", endpoint: "/api/v2/retail/products/unarchive" },
    },
  ],
  bulk: [
    {
      key: "archive",
      label: "Archive",
      requires: [["retail.catalog", "update"]],
      tabs: ["selling", "low", "all"],
      do: { run: "archivemany", endpoint: "/api/v2/retail/products/archive" },
    },
    {
      key: "unarchive",
      label: "Sell them again",
      requires: [["retail.catalog", "update"]],
      tabs: ["archived"],
      do: { run: "unarchive", endpoint: "/api/v2/retail/products/unarchive" },
    },
    { key: "export" },
  ],
  primary: { label: "New product", icon: "plus", requires: [["retail.catalog", "create"]], sheet: "product-new" },
  card: { title: "name", badge: "flag", figure: "price", meta: "{cardMeta}" },
  empty: {
    icon: "Rows",
    title: "What do you sell?",
    line: "Add a product with a name, a category and a price. It is on every till the moment you save.",
    primary: { label: "Add your first product", sheet: "product-new" },
  },
  catalog: false,
};

const productsSource: ReportDefinition = {
  key: "retail-products",
  title: "Products",
  area: "Products",
  href: "/retail/products",
  profiles: ["RETAIL"],
  params: [],
  columns: products.columns,
  defaults: { sort: products.sorts[0]!.rules },
  list: products,
};

export const PRODUCT_REPORTS: ReportDefinition[] = [productsSource];
