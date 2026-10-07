import type { Condition, ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Price lists (PRD-05, 20-products 4.4, `PriceLists.png`): every list the
 * till may charge from, when it applies and what its prices are; and one
 * list's worksheet (`retail-prices`), its products at their prices, cost and
 * margin. Its prices are typed in place (PRD-07, `PricesList.png`): the save
 * bar saves them as one batch, the margins follow as they are typed, and the
 * ticked rows go to Change many prices.
 */

const VIEW: ListGrant[] = [["retail.prices", "view"]];
const CREATE: ListGrant[] = [["retail.prices", "create"]];
const UPDATE: ListGrant[] = [["retail.prices", "update"]];
/** Nothing leaves the default list: a product leaves it by being archived. */
const NOT_DEFAULT: Condition[] = [{ column: "isDefault", op: "is", value: ["No"] }];

const priceLists: ListSpec = {
  noun: "price lists",
  read: VIEW,
  search: { placeholder: "Name", keys: ["name"] },
  filters: [
    {
      key: "audience",
      label: "Applies to",
      type: "choice",
      any: "Anyone",
      column: "audience",
      primary: true,
      options: [
        { value: "EVERYONE", label: "Everyone" },
        { value: "ACCOUNT_CUSTOMERS", label: "Customers on account" },
        { value: "LOYALTY_MEMBERS", label: "Loyalty members" },
        { value: "STAFF", label: "Staff" },
      ],
    },
    // Passed to the loader: a list for every site applies at each one.
    { key: "site", label: "Site", type: "choice", any: "All sites", optionsFromLoader: true, primary: true, hideBelow: 2 },
  ],
  sorts: [
    {
      key: "in-use",
      label: "In use first",
      rules: [
        { column: "rank", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "changed",
      label: "Changed, newest",
      rules: [
        { column: "changed", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["state"],
  columns: [
    { key: "name", label: "Price list", kind: "text", cell: "link", width: "minmax(170px,1.2fr)", align: "start", priority: 1 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      tones: { Default: "hollow", "In use": "hollow", Draft: "neutral", Paused: "warn" },
      width: "110px",
      align: "start",
      priority: 1,
    },
    { key: "usedWhen", label: "Used when", kind: "text", cell: "muted", width: "minmax(180px,1.3fr)", align: "start", priority: 1 },
    { key: "pricesRule", label: "Prices", kind: "text", cell: "muted", width: "150px", align: "start", priority: 2 },
    { key: "products", label: "Products", kind: "number", cell: "num", width: "90px", align: "end", priority: 2 },
    { key: "belowCost", label: "Below cost", kind: "number", cell: "owed", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "changed", label: "Changed", kind: "date", cell: "date", width: "140px", align: "start", priority: 3 },
    { key: "rank", label: "Order", kind: "number", cell: "num", hidden: true, width: "60px", align: "end", priority: 3 },
    { key: "audience", label: "Applies to", kind: "text", cell: "muted", hidden: true, width: "120px", align: "start", priority: 3 },
  ],
  rowHref: "/retail/products/price-lists/{id}",
  rowMenu: [
    { key: "rules", label: "Edit the rules", requires: UPDATE, do: { sheet: "price-list-rules" } },
    {
      key: "pause",
      label: "Pause",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["ON"] }],
      do: { run: "pricelistpause", endpoint: "/api/v2/retail/price-lists/pause" },
    },
    {
      key: "resume",
      label: "Switch on",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["DRAFT", "PAUSED"] }],
      do: { run: "pricelistresume", endpoint: "/api/v2/retail/price-lists/resume" },
    },
  ],
  bulk: [
    { key: "duplicate", label: "Duplicate", requires: CREATE, do: { run: "pricelistduplicate", endpoint: "/api/v2/retail/price-lists/duplicate" } },
    {
      key: "pause",
      label: "Pause",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "isNot", value: ["PAUSED"] }],
      do: { run: "pricelistpause", endpoint: "/api/v2/retail/price-lists/pause" },
    },
    {
      key: "resume",
      label: "Switch on",
      requires: UPDATE,
      when: [{ column: "stateKey", op: "is", value: ["PAUSED"] }],
      do: { run: "pricelistresume", endpoint: "/api/v2/retail/price-lists/resume" },
    },
    { key: "sheet", label: "Print price sheet", requires: VIEW, do: { download: "/api/v2/retail/price-lists/price-sheet", open: true } },
    { key: "export" },
  ],
  primary: { label: "New price list", icon: "plus", requires: CREATE, sheet: "price-list-new" },
  card: { title: "name", badge: "state", figure: "products", meta: "{usedWhen} · {pricesRule}" },
  empty: {
    icon: "Tag",
    title: "No price lists yet",
    line: "Every shop has a Retail list. Add another for wholesale, happy hour or staff.",
    primary: { label: "New price list", sheet: "price-list-new", requires: CREATE },
  },
};

const prices: ListSpec = {
  noun: "prices",
  read: VIEW,
  search: { placeholder: "Name, code or barcode", keys: ["name", "code", "barcode"] },
  filters: [
    { key: "list", type: "parent", column: "priceListId" },
    { key: "category", label: "Category", type: "choice", any: "Any", optionsFromLoader: true, column: "categoryId", primary: true },
    { key: "supplier", label: "Supplier", type: "choice", any: "Any", optionsFromLoader: true, column: "supplierId", primary: true },
    {
      key: "margin",
      label: "Margin",
      type: "choice",
      any: "Any",
      primary: true,
      requires: "view-cost",
      options: [
        { value: "under-target", label: "Under target", where: [{ column: "marginTone", op: "is", value: ["warn", "bad"] }] },
        { value: "under-cost", label: "Under cost", where: [{ column: "underCost", op: "is", value: ["Yes"] }] },
      ],
    },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "margin",
      label: "Margin, lowest first",
      requires: "view-cost",
      rules: [
        { column: "margin", dir: "asc" },
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
    {
      key: "changed",
      label: "Changed, newest",
      rules: [
        { column: "changedOn", dir: "desc" },
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
      href: "/retail/products/{productId}",
      width: "minmax(190px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "code", label: "Code", kind: "text", cell: "mono", width: "130px", align: "start", priority: 2 },
    { key: "cost", label: "Cost", kind: "money", currency: "USD", cell: "zero", total: "sum", requires: "view-cost", width: "100px", align: "end", priority: 2 },
    {
      key: "margin",
      label: "Margin",
      kind: "number",
      cell: "num",
      percent: true,
      pillKey: "marginTone",
      total: "avg",
      totalSuffix: "average",
      ratio: { num: "profit", den: "pricedCost" },
      derive: { kind: "margin", from: "price", costKey: "cost", targetKey: "targetMargin" },
      requires: "view-cost",
      width: "120px",
      align: "end",
      priority: 1,
    },
    // An input for whoever may change prices; a figure for everyone else (`edit.requires`).
    { key: "price", label: "Price", kind: "money", currency: "USD", cell: "edit-money", total: "sum", width: "130px", align: "end", priority: 1 },
    { key: "was", label: "Was", kind: "money", currency: "USD", cell: "zero", width: "90px", align: "end", priority: 3 },
    { key: "changed", label: "Changed", kind: "text", cell: "text", toneKey: "changedTone", width: "128px", align: "start", priority: 3 },
    { key: "vat", label: "VAT", kind: "number", cell: "num", percent: true, width: "72px", align: "end", priority: 3 },
    { key: "category", label: "Category", kind: "text", cell: "muted", hidden: true, width: "130px", align: "start", priority: 3 },
    { key: "changedOn", label: "Changed on", kind: "date", cell: "date", hidden: true, width: "110px", align: "start", priority: 3 },
  ],
  rowHref: "/retail/products/{productId}",
  subLink: { label: "Edit the rules", sheet: "price-list-rules", requires: UPDATE, idFrom: "list" },
  primary: { label: "Add products to this list", icon: "plus", requires: UPDATE, sheet: "price-list-add", idFrom: "list" },
  rowMenu: [
    { key: "open", label: "Open the product", requires: VIEW, do: { href: "/retail/products/{productId}" } },
    { key: "history", label: "Price history", requires: VIEW, do: { href: "/retail/products/{productId}?tab=price-history" } },
    {
      key: "remove",
      label: "Remove from this list",
      requires: UPDATE,
      tone: "bad",
      separated: true,
      whenParent: NOT_DEFAULT,
      do: { run: "removefromlist", endpoint: "/api/v2/retail/price-lists/{list}/products/remove" },
    },
  ],
  bulk: [
    { key: "raise", label: "Raise by a percentage", requires: UPDATE, do: { sheet: "bulk-price", with: { list: "{list}", how: "RAISE" } } },
    { key: "margin", label: "Set a margin", requires: UPDATE, do: { sheet: "bulk-price", with: { list: "{list}", how: "MARGIN" } } },
    { key: "round", label: "Round to 5 cents", requires: UPDATE, do: { sheet: "bulk-price", with: { list: "{list}", how: "ROUND" } } },
    {
      key: "remove",
      label: "Remove from this list",
      requires: UPDATE,
      tone: "bad",
      whenParent: NOT_DEFAULT,
      do: { run: "removefromlist", endpoint: "/api/v2/retail/price-lists/{list}/products/remove" },
    },
    { key: "export" },
  ],
  edit: {
    column: "price",
    endpoint: "/api/v2/retail/price-lists/{list}/prices",
    changedLabel: "prices changed",
    note: "The till picks them up the moment you save. Margins update as you type.",
    save: "Save prices",
    changedColumn: "changed",
    sheet: "price-edit",
    requires: UPDATE,
  },
  card: { title: "name", figure: "price", meta: "{cardMeta}" },
  empty: {
    icon: "Tag",
    title: "Nothing is on {parent} yet",
    line: "Add products and price them from the Retail list, less or more a percentage.",
    primary: { label: "Add products to this list", sheet: "price-list-add", requires: UPDATE, idFrom: "list" },
  },
};

export const PRICE_LIST_REPORTS: ReportDefinition[] = [
  {
    key: "retail-price-lists",
    title: "Price lists",
    area: "Products",
    href: "/retail/products/price-lists",
    profiles: ["RETAIL"],
    params: [],
    columns: priceLists.columns,
    defaults: { sort: priceLists.sorts[0]!.rules },
    list: priceLists,
  },
  {
    key: "retail-prices",
    title: "Prices",
    area: "Products",
    href: "/retail/products/price-lists",
    profiles: ["RETAIL"],
    params: [],
    columns: prices.columns,
    defaults: { sort: prices.sorts[0]!.rules },
    list: prices,
  },
];
