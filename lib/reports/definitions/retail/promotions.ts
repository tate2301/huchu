import type { ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Promotions (PRD-09, 20-products 5.17, `PromotionsList.png`): every
 * promotion with its state by the clock, what it applies to, its dates and
 * what it sold and gave away; and a promotion record's two tabs, the products
 * it covers and every sale line it discounted.
 */

const VIEW: ListGrant[] = [["retail.promotions", "view"]];
const CREATE: ListGrant[] = [["retail.promotions", "create"]];
const UPDATE: ListGrant[] = [["retail.promotions", "update"]];

const NOT_ENDED = { column: "stateKey", op: "isNot" as const, value: ["ENDED"] };
const PAUSABLE = { column: "stateKey", op: "is" as const, value: ["RUNNING", "SCHEDULED"] };
const PAUSED = { column: "stateKey", op: "is" as const, value: ["PAUSED"] };

const promotions: ListSpec = {
  noun: "promotions",
  read: VIEW,
  search: { placeholder: "Name or code", keys: ["name", "code"] },
  tabs: [
    { key: "running", label: "Running", where: [{ column: "stateKey", op: "is", value: ["RUNNING", "PAUSED"] }] },
    { key: "scheduled", label: "Scheduled", where: [{ column: "stateKey", op: "is", value: ["SCHEDULED"] }] },
    { key: "ended", label: "Ended", where: [{ column: "stateKey", op: "is", value: ["ENDED"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    {
      key: "type",
      label: "Type",
      type: "choice",
      any: "Any",
      column: "typeKey",
      primary: true,
      options: [
        { value: "PERCENT", label: "Percent off" },
        { value: "AMOUNT", label: "Amount off" },
        { value: "BUY_X_PAY", label: "Buy X, pay less" },
        { value: "FIXED_PRICE", label: "Fixed price" },
      ],
    },
    {
      key: "appliesTo",
      label: "Applies to",
      type: "choice",
      any: "Anything",
      column: "appliesKey",
      primary: true,
      options: [
        { value: "EVERYTHING", label: "Everything" },
        { value: "CATEGORIES", label: "Categories" },
        { value: "PRODUCTS", label: "Products" },
        { value: "BASKET", label: "Basket" },
      ],
    },
  ],
  sorts: [
    {
      key: "starts",
      label: "Starts, newest",
      rules: [
        { column: "starts", dir: "desc" },
        { column: "code", dir: "asc" },
      ],
    },
    {
      key: "ends",
      label: "Ends soonest",
      rules: [
        { column: "ends", dir: "asc" },
        { column: "code", dir: "asc" },
      ],
    },
    {
      key: "given",
      label: "Given away, most",
      rules: [
        { column: "givenAway", dir: "desc" },
        { column: "code", dir: "asc" },
      ],
    },
  ],
  groups: ["state", "type"],
  columns: [
    { key: "code", label: "Promotion", kind: "code", cell: "ref", width: "130px", align: "start", priority: 1 },
    { key: "name", label: "Name", kind: "text", cell: "text", width: "minmax(170px,1.3fr)", align: "start", priority: 1 },
    { key: "state", label: "State", kind: "status", cell: "state", toneKey: "stateTone", width: "110px", align: "start", priority: 1 },
    { key: "type", label: "Type", kind: "text", cell: "muted", width: "100px", align: "start", priority: 2 },
    { key: "appliesTo", label: "Applies to", kind: "text", cell: "muted", width: "120px", align: "start", priority: 2 },
    { key: "starts", label: "Starts", kind: "date", cell: "date", width: "130px", align: "start", priority: 1 },
    { key: "ends", label: "Ends", kind: "date", cell: "date", emptyWords: "No end", width: "110px", align: "start", priority: 2 },
    { key: "value", label: "Value", kind: "text", cell: "mono", width: "80px", align: "end", priority: 1 },
    { key: "sold", label: "Sold", kind: "number", cell: "num", total: "sum", width: "80px", align: "end", priority: 1 },
    { key: "givenAway", label: "Given away", kind: "money", currency: "USD", cell: "money", total: "sum", width: "110px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/products/promotions/{id}",
  rowMenu: [
    { key: "edit", label: "Edit rules", requires: UPDATE, when: [NOT_ENDED], do: { sheet: "promotion-edit" } },
    { key: "pause", label: "Pause", requires: UPDATE, when: [PAUSABLE], do: { run: "promopause", endpoint: "/api/v2/retail/promotions/pause" } },
    { key: "resume", label: "Resume", requires: UPDATE, when: [PAUSED], do: { run: "promoresume", endpoint: "/api/v2/retail/promotions/resume" } },
    { key: "end", label: "End now", requires: UPDATE, when: [NOT_ENDED], do: { run: "promoend", endpoint: "/api/v2/retail/promotions/end" } },
  ],
  bulk: [
    { key: "pause", label: "Pause", requires: UPDATE, when: [PAUSABLE], do: { run: "promopause", endpoint: "/api/v2/retail/promotions/pause" } },
    { key: "resume", label: "Resume", requires: UPDATE, when: [PAUSED], do: { run: "promoresume", endpoint: "/api/v2/retail/promotions/resume" } },
    { key: "end", label: "End now", requires: UPDATE, when: [NOT_ENDED], do: { run: "promoendmany", endpoint: "/api/v2/retail/promotions/end" } },
    { key: "duplicate", label: "Duplicate", requires: CREATE, do: { run: "promoduplicate", endpoint: "/api/v2/retail/promotions/duplicate" } },
    { key: "export" },
  ],
  primary: { label: "New promotion", icon: "plus", sheet: "promotion-new", requires: CREATE },
  card: { title: "name", badge: "state", figure: "givenAway", meta: "{cardMeta}" },
  empty: {
    icon: "Tag",
    title: "No promotions yet",
    line: "Take money off a category, a product or a basket between two dates. It runs on its own, and its page says whether it paid.",
    primary: { label: "New promotion", sheet: "promotion-new", requires: CREATE },
  },
};

const PROMOTION_PARENT: ListSpec["filters"][number] = { key: "promotion", type: "parent", column: "promotionId" };

/** The products it covers: normal and promotion prices, what sold under it, what it gave away, the margin now. */
const promotionProducts: ListSpec = {
  noun: "products",
  read: VIEW,
  search: { placeholder: "Product", keys: ["product"] },
  filters: [PROMOTION_PARENT],
  sorts: [
    {
      key: "sold",
      label: "Most sold",
      rules: [
        { column: "sold", dir: "desc" },
        { column: "product", dir: "asc" },
      ],
    },
  ],
  columns: [
    { key: "product", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "normal", label: "Normal", kind: "money", currency: "USD", cell: "money", width: "100px", align: "end", priority: 2 },
    { key: "onPromotion", label: "On promotion", kind: "money", currency: "USD", cell: "money", width: "120px", align: "end", priority: 1 },
    { key: "sold", label: "Sold", kind: "number", cell: "num", total: "sum", width: "80px", align: "end", priority: 1 },
    { key: "givenAway", label: "Given away", kind: "money", currency: "USD", cell: "money", total: "sum", width: "110px", align: "end", priority: 1 },
    {
      key: "margin",
      label: "Margin now",
      kind: "number",
      cell: "num",
      percent: true,
      pillKey: "marginTone",
      total: "avg",
      totalSuffix: "average",
      ratio: { num: "profit", den: "pricedCost" },
      requires: "view-cost",
      width: "110px",
      align: "end",
      priority: 1,
    },
  ],
  rowHref: "/retail/products/{productId}",
  card: { title: "product", figure: "onPromotion", meta: "{sold} sold · {givenAwayText} given away" },
  empty: { icon: "Package", title: "No products", line: "Edit its rules to choose what it applies to." },
};

/** Every sale line it discounted: when, the sale, the till, the product, how many and what it gave away. */
const promotionSales: ListSpec = {
  noun: "sales",
  read: VIEW,
  search: { placeholder: "Sale, till or product", keys: ["saleNo", "till", "product"] },
  filters: [PROMOTION_PARENT],
  sorts: [
    {
      key: "newest",
      label: "Newest first",
      rules: [
        { column: "at", dir: "desc" },
        { column: "saleNo", dir: "desc" },
      ],
    },
  ],
  columns: [
    { key: "at", label: "When", kind: "date", cell: "when", width: "120px", align: "start", priority: 1 },
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", href: "/retail/sales/{saleId}", width: "120px", align: "start", priority: 1 },
    { key: "till", label: "Till", kind: "text", cell: "muted", width: "110px", align: "start", priority: 2 },
    { key: "product", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "quantity", label: "Quantity", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "givenAway", label: "Given away", kind: "money", currency: "USD", cell: "money", total: "sum", width: "110px", align: "end", priority: 1 },
  ],
  rowHref: "/retail/sales/{saleId}",
  card: { title: "saleNo", figure: "givenAway", meta: "{whenText} · {product}" },
  empty: { icon: "Receipt", title: "Nothing sold under it yet", line: "Every sale it takes money off shows here." },
};

/** A record tab's source sorts by its own first sort; the list has a default. */
function source(key: string, title: string, list: ListSpec, sorted = false): ReportDefinition {
  return {
    key,
    title,
    area: "Products",
    href: "/retail/products/promotions",
    profiles: ["RETAIL"],
    params: [],
    columns: list.columns,
    defaults: sorted ? { sort: list.sorts[0]!.rules } : {},
    list,
  };
}

export const PROMOTION_REPORTS: ReportDefinition[] = [
  source("retail-promotions", "Promotions", promotions, true),
  source("retail-promotion-products", "What a promotion covers", promotionProducts, true),
  source("retail-promotion-sales", "Sales under a promotion", promotionSales, true),
];
