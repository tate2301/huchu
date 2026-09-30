import { periodParams } from "@/lib/reports/params";
import type { ReportDefinition } from "@/lib/reports/types";

/** A shop's reports: what sold, for how much, what is left, and whether the tills balanced. */

const PROFILES = ["RETAIL"];

const sales: ReportDefinition = {
  key: "retail-sales",
  title: "Sales",
  area: "Selling",
  href: "/retail/sales",
  profiles: PROFILES,
  params: periodParams(7),
  columns: [
    { key: "saleNo", label: "Sale", kind: "code" },
    { key: "date", label: "Date", kind: "date" },
    { key: "site", label: "Shop", kind: "text" },
    { key: "cashier", label: "Cashier", kind: "text" },
    { key: "customer", label: "Customer", kind: "text", hidden: true },
    { key: "type", label: "Type", kind: "status" },
    { key: "status", label: "Status", kind: "status" },
    { key: "subtotal", label: "Before discount", kind: "money", hidden: true, total: "sum" },
    { key: "discount", label: "Discount", kind: "money", total: "sum" },
    { key: "tax", label: "Tax", kind: "money", hidden: true, total: "sum" },
    { key: "total", label: "Total", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
  layout: {
    blocks: [
      { id: "figures", type: "figures" },
      { id: "over-time", type: "chart", form: "trend", by: "date", measure: { column: "total", fn: "sum" }, limit: 8, title: "Takings over time" },
      { id: "by-cashier", type: "chart", form: "bars", by: "cashier", measure: { column: "total", fn: "sum" }, limit: 8, title: "By cashier", half: true },
      { id: "by-shop", type: "chart", form: "bars", by: "site", measure: { column: "total", fn: "sum" }, limit: 8, title: "By shop", half: true },
      { id: "table", type: "table" },
    ],
  },
};

const itemsSold: ReportDefinition = {
  key: "retail-items-sold",
  title: "Items sold",
  area: "Selling",
  href: "/retail/sales",
  profiles: PROFILES,
  params: periodParams(30),
  columns: [
    { key: "item", label: "Item", kind: "text" },
    { key: "date", label: "Date", kind: "date" },
    { key: "saleNo", label: "Sale", kind: "code", hidden: true },
    { key: "quantity", label: "Quantity", kind: "number", total: "sum" },
    { key: "unitPrice", label: "Price", kind: "money", hidden: true, total: "avg" },
    { key: "revenue", label: "Revenue", kind: "money", total: "sum" },
    { key: "cost", label: "Cost", kind: "money", total: "sum" },
    { key: "margin", label: "Margin", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "revenue", dir: "desc" }], groupBy: "item" },
  layout: {
    blocks: [
      { id: "figures", type: "figures" },
      { id: "best-sellers", type: "chart", form: "bars", by: "item", measure: { column: "revenue", fn: "sum" }, limit: 10, title: "Best sellers", half: true },
      { id: "over-time", type: "chart", form: "trend", by: "date", measure: { column: "revenue", fn: "sum" }, limit: 8, title: "Revenue over time", half: true },
      { id: "table", type: "table" },
    ],
  },
};

const stock: ReportDefinition = {
  key: "retail-stock",
  title: "Stock on hand",
  area: "Stock",
  href: "/retail/stock",
  profiles: PROFILES,
  params: [],
  columns: [
    { key: "item", label: "Item", kind: "text" },
    { key: "code", label: "Code", kind: "code" },
    { key: "category", label: "Category", kind: "status" },
    { key: "site", label: "Shop", kind: "text" },
    { key: "state", label: "Level", kind: "status" },
    { key: "onHand", label: "On hand", kind: "number", total: "sum" },
    { key: "min", label: "Reorder at", kind: "number", hidden: true },
    { key: "unitCost", label: "Unit cost", kind: "money", hidden: true },
    { key: "value", label: "Value at cost", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "value", dir: "desc" }] },
};

const tills: ReportDefinition = {
  key: "retail-shifts",
  title: "Till shifts",
  area: "Selling",
  href: "/retail/shifts",
  profiles: PROFILES,
  params: periodParams(14, "Opened"),
  columns: [
    { key: "shiftNo", label: "Shift", kind: "code" },
    { key: "register", label: "Till", kind: "text" },
    { key: "cashier", label: "Cashier", kind: "text" },
    { key: "opened", label: "Opened", kind: "date" },
    { key: "status", label: "Status", kind: "status" },
    { key: "float", label: "Float", kind: "money", hidden: true, total: "sum" },
    { key: "expected", label: "Expected cash", kind: "money", total: "sum" },
    { key: "counted", label: "Counted", kind: "money", total: "sum" },
    { key: "variance", label: "Over or short", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "opened", dir: "desc" }] },
};

export const RETAIL_REPORTS: ReportDefinition[] = [sales, itemsSold, tills, stock];
