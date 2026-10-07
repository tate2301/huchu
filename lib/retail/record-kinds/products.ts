import { fetchJson } from "@/lib/api-client";
import { archiveAsk } from "@/lib/retail/asks/products";
import {
  depositWords,
  idCheckWords,
  levelWords,
  priceListsWords,
  productKpis,
} from "@/lib/retail/products/record-words";
import { runOutChip, type StockChart } from "@/lib/retail/products/stock-chart";
import type { ProductView } from "@/lib/retail/products/view";
import { formatCount, formatMoney, formatShortDay, formatSignedCount } from "@/lib/workspace/format";

import type { Grant, RecordAction, RecordChart, RecordKind, RecordLinePoint } from "./types";

/**
 * The product record kind (00-foundations 5.6.10, Product board, PRD-04):
 * its five figures, When it runs out, its sales, stock, prices and suppliers
 * as tabs, and the rail edited in place. Edit opens the Edit a product sheet
 * over it; an archived product says so under the header with "Sell it again".
 *
 * The record is the product's view and its stock chart, read side by side.
 */

export type ProductRecord = ProductView & { stockChart: StockChart };

const UPDATE: Grant = ["retail.catalog", "update"];
const VIEW: Grant = ["retail.catalog", "view"];
const ADJUST: Grant = ["retail.adjustments", "create"];
const CREATE: Grant = ["retail.catalog", "create"];

/** "18.50" → "18.50", as the API reads money. A blank or a word is refused in words. */
function figure(text: string, { optional = false } = {}): string | null {
  const trimmed = text.trim().replace(/,/g, "").replace(/^US\$/, "");
  if (!trimmed) {
    if (optional) return null;
    throw new Error("Give a figure, like 18.50.");
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) throw new Error("Write it as a figure, zero or more, like 18.50.");
  return trimmed;
}

function needed(label: string) {
  return (text: string) => {
    if (!text.trim()) throw new Error(`${label} is needed.`);
    return text.trim();
  };
}

/** The seg's "Yes" or "No". */
const parseIdCheck = (text: string): boolean => text === "Yes";

async function uploadPhoto(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/v2/retail/products/image", { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "That picture could not be saved. Try again.");
  const url: string | undefined = payload?.data?.url;
  if (!url) throw new Error("The upload finished but returned no address.");
  return url;
}

const productUrl = (id: string) => `/api/v2/retail/products/${id}`;

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
/** "Fri 3 Oct". */
const tipDay = (day: string) => `${WEEKDAY.format(new Date(`${day}T12:00:00Z`))} ${formatShortDay(`${day}T12:00:00Z`, "UTC")}`;

/** When it runs out: on hand day by day, dashed on to the day it runs out. */
function stockChart(product: ProductRecord): RecordChart {
  const chart = product.stockChart;
  const perDay = chart.perDay;
  const points: RecordLinePoint[] = chart.days.map((day) => ({
    date: day.date,
    value: day.onHand,
    tip: {
      label: tipDay(day.date),
      value: `${formatCount(day.onHand)} on hand`,
      sub: [`${formatCount(day.sold)} sold`, ...(day.received > 0 ? [`${formatCount(day.received)} received`] : [])].join(" · "),
    },
  }));
  const projection: RecordLinePoint[] = chart.projection.map((day, index) => ({
    date: day.date,
    value: day.onHand,
    tip:
      index === 0
        ? points[points.length - 1]!.tip
        : {
            label: `${tipDay(day.date)} · expected`,
            value: `${formatCount(Math.round(day.onHand))} on hand, if it keeps selling`,
            sub: `About ${formatCount(Math.round(perDay))} a day`,
          },
  }));
  const first = chart.days[0]?.date;
  const today = chart.days[chart.days.length - 1]?.date ?? "";
  // Every ten days from the first, today, and the day it runs out.
  const ticks = first
    ? [
        ...chart.days.filter((_, index) => index % 10 === 0 && chart.days.length - 1 - index >= 4).map((day) => day.date),
        today,
        ...(chart.runsOutOn && chart.runsOutOn !== today && projection.some((day) => day.date === chart.runsOutOn) ? [chart.runsOutOn] : []),
      ]
    : [];
  return {
    title: "When it runs out",
    chip: runOutChip(chart) ?? undefined,
    aside: perDay > 0 ? `Selling about ${perDay.toFixed(1)} a day` : "Not sold in 30 days",
    line: {
      points,
      projection,
      reference: chart.reorderAt === null ? null : { value: chart.reorderAt, label: `reorder at ${formatCount(chart.reorderAt)}` },
      markers: chart.received.map((day) => ({ date: day.date, label: `${formatSignedCount(day.quantity)} received`, tone: "ok" as const })),
      todayFrom: today,
      ticks: ticks.map((date) => ({ date, label: formatShortDay(`${date}T12:00:00Z`, "UTC") })),
    },
    footer: chart.advice ? { text: chart.advice.sentence } : undefined,
  };
}

/** "Single; case of 24": a case product's line says what it holds. */
const caseChip = (product: ProductView) =>
  product.packOf ? [{ label: `Case of ${product.packSize ?? "?"} × ${product.packOf.name}`, tone: "plain" as const }] : [];

export const productKind: RecordKind<ProductRecord> = {
  type: "Product",
  back: { label: "Products", href: "/retail/products" },
  queryKey: (id) => ["retail-product", id],
  load: async (id) => {
    const [view, chart] = await Promise.all([
      fetchJson<{ data: ProductView }>(productUrl(id)),
      fetchJson<{ data: StockChart }>(`${productUrl(id)}/stock-chart?days=30`),
    ]);
    return { ...view.data, stockChart: chart.data };
  },
  endpoint: productUrl,
  title: (product) => product.name,
  reference: (product) => product.code,
  actions: (product) => [
    { key: "edit", label: "Edit", requires: [UPDATE], do: { sheet: "product-edit", id: product.id } },
    // W-23: breakage, own use, found more or a fixed mistake.
    { key: "adjust", label: "Adjust stock", requires: [ADJUST], do: { sheet: "stock-adjust", params: { productId: product.id } } },
  ],
  more: (product): RecordAction[] => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/Product/${product.id}/pdf` } },
    // W-26: a case, or a single sold by the case too, while the shop sells cases and singles.
    ...((product.packOf || product.hasCases) && product.casesAndSingles
      ? [{ key: "case-break", label: "Break a case", requires: [ADJUST], do: { sheet: "case-break", params: { productId: product.id } } }]
      : []),
    { key: "duplicate", label: "Duplicate", requires: [CREATE], do: { sheet: "product-new", params: { from: product.id } } },
    product.isActive
      ? {
          key: "archive",
          label: "Stop selling it (archive)",
          requires: [UPDATE],
          do: {
            post: {
              url: "/api/v2/retail/products/archive",
              body: { ids: [product.id] },
              ask: archiveAsk({ name: product.name, onHand: product.stock.onHand > 0 ? product.stock.onHandLabel : null }),
              done: `${product.name} is off every till.`,
            },
          },
        }
      : {
          key: "unarchive",
          label: "Sell it again",
          requires: [UPDATE],
          do: { post: { url: "/api/v2/retail/products/unarchive", body: { ids: [product.id] }, done: `${product.name} is on sale again.` } },
        },
  ],
  bin: {
    kind: "product",
    deleteRight: ["retail.catalog", "delete"],
    state: (product) => product.bin,
    meanwhile: "Off the till and out of lists; its sales and stock history stay.",
  },
  banner: (product) =>
    !product.isActive && !product.archivedAt
      ? {
          lead: "Archived.",
          text: `Not on the till or in reorder suggestions. ${
            product.stock.onHand > 0 ? `Its ${product.stock.onHandLabel} in stock still count.` : "Its stock still counts."
          }`,
          action: {
            label: "Sell it again",
            post: "/api/v2/retail/products/unarchive",
            body: { ids: [product.id] },
            done: `${product.name} is on sale again.`,
            requires: UPDATE,
          },
        }
      : null,
  chips: (product) => [
    ...(product.out ? [{ label: "Out of stock", tone: "bad" as const }] : []),
    ...(product.low
      ? [
          {
            label:
              product.figures.coverDays === null
                ? "Reorder soon"
                : `Reorder soon · about ${product.figures.coverDays} ${product.figures.coverDays === 1 ? "day" : "days"} left`,
            tone: "warn" as const,
          },
        ]
      : []),
    ...(!product.isActive && !product.archivedAt ? [{ label: "Archived", tone: "plain" as const }] : []),
    ...(product.category ? [{ label: product.category.path, tone: "plain" as const }] : []),
    ...(product.ageCheck ? [{ label: "ID check at the till", tone: "plain" as const }] : []),
    ...caseChip(product),
  ],
  figure: (product) => ({ label: "Selling at", value: formatMoney(product.price, product.currency) }),
  kpis: (product) => productKpis(product),
  chart: (product) => stockChart(product),
  tabs: [
    {
      // W-28: the product's ledger, its last 30 days, newest first.
      key: "stock-movements",
      label: "Stock movements",
      source: "retail-stock-movements",
      parent: "product",
      requires: ["retail.stock", "view"],
      columns: ["at", { key: "movementLong", label: "Movement" }, "reference", "by", "change", "balance"],
      allLink: { label: "All movements", href: (product) => `/retail/stock/movements?product=${product.id}` },
      totalsText: (_product, totals) => ({
        at: "Σ 30 days",
        movementLong: `in ${formatSignedCount(Number(totals.in ?? 0))} · out ${formatSignedCount(Number(totals.out ?? 0))}`,
        balance: formatCount(Number(totals.onHand ?? 0)),
      }),
    },
    {
      key: "sales",
      label: "Sales",
      source: "retail-product-sales",
      parent: "product",
    },
    {
      key: "price-history",
      label: "Price history",
      source: "retail-product-price-history",
      parent: "product",
      requires: ["retail.prices", "view"],
    },
    {
      key: "suppliers",
      label: "Suppliers",
      source: "retail-product-suppliers",
      parent: "product",
      requires: ["retail.catalog", "view-cost"],
    },
    { key: "activity", label: "Activity" },
  ],
  railTop: (product) => ({
    photo: {
      url: product.imageUrl,
      prompt: "Add a photo",
      sub: "The till shows it on the product button",
      edit: { field: "imageUrl", upload: (file) => uploadPhoto(file), requires: UPDATE },
    },
  }),
  rail: (product) => {
    const levels = product.stock.levelsEditable;
    return [
      {
        title: "Price",
        rows: [
          {
            key: "price",
            label: "Price",
            value: formatMoney(product.price, product.currency),
            mono: true,
            // Through the price core on the default list (W-14): the owner rule and the history row.
            ...(product.canEdit.price
              ? { edit: { field: "price", type: "money" as const, initial: product.price.toFixed(2), parse: (text: string) => figure(text), requires: UPDATE } }
              : {}),
          },
          {
            key: "cost",
            label: "Cost",
            value: product.cost === null ? "Not on file" : formatMoney(product.cost, product.currency),
            mono: product.cost !== null,
            muted: product.cost === null,
            visible: ["retail.catalog", "view-cost"],
            edit: {
              field: "cost",
              type: "money",
              initial: product.cost === null ? "" : product.cost.toFixed(2),
              parse: (text) => figure(text, { optional: true }),
              requires: UPDATE,
            },
          },
          // From the category: changed there, or by moving the product to another.
          { key: "vat", label: "VAT", value: product.vatLabel },
          { key: "price-lists", label: "Price lists", value: priceListsWords(product) },
        ],
      },
      {
        title: "Stock",
        rows: [
          {
            key: "reorder-at",
            label: "Reorder at",
            value: levelWords(product, "reorderAt", "Never asked"),
            mono: product.stock.reorderAt !== null,
            muted: product.stock.reorderAt === null && levels,
            ...(levels
              ? {
                  edit: {
                    field: "reorderAt",
                    type: "number" as const,
                    initial: product.stock.reorderAt === null ? "" : String(product.stock.reorderAt),
                    parse: (text: string) => figure(text, { optional: true }),
                    requires: UPDATE,
                  },
                }
              : {}),
          },
          {
            key: "reorder",
            label: "Reorder",
            value: levelWords(product, "reorderQty", "Not set"),
            mono: product.stock.reorderQty !== null,
            muted: product.stock.reorderQty === null && levels,
            ...(levels
              ? {
                  edit: {
                    field: "reorderQty",
                    type: "number" as const,
                    initial: product.stock.reorderQty === null ? "" : String(product.stock.reorderQty),
                    parse: (text: string) => figure(text, { optional: true }),
                    requires: UPDATE,
                  },
                }
              : {}),
          },
          {
            key: "supplier",
            label: "Supplier",
            value: product.supplier?.name ?? "None",
            muted: !product.supplier,
            edit: {
              field: "supplierId",
              type: "auto",
              initial: product.supplier?.id ?? "",
              lookup: { noun: "supplier", picked: product.supplier ? { id: product.supplier.id, label: product.supplier.name } : null },
              parse: (value) => value || null,
              requires: UPDATE,
            },
          },
          { key: "sold-as", label: "Sold as", value: product.soldAs },
        ],
      },
      {
        title: "Details",
        rows: [
          {
            key: "name",
            label: "Name",
            value: product.name,
            edit: { field: "name", type: "text", initial: product.name, parse: needed("Name"), requires: UPDATE },
          },
          {
            key: "code",
            label: "Code",
            value: product.code,
            mono: true,
            edit: { field: "code", type: "text", mono: true, initial: product.code, parse: (text) => needed("Code")(text).toUpperCase(), requires: UPDATE },
          },
          {
            key: "barcode",
            label: "Barcode",
            value: product.barcode ? `${product.barcode.slice(0, 7)} ${product.barcode.slice(7)}`.trim() : "Not on file",
            mono: Boolean(product.barcode),
            muted: !product.barcode,
            edit: {
              field: "barcode",
              type: "text",
              mono: true,
              initial: product.barcode ?? "",
              parse: (text) => text.trim() || null,
              requires: UPDATE,
            },
          },
          {
            key: "category",
            label: "Category",
            value: product.category?.path ?? "None",
            muted: !product.category,
            edit: {
              field: "categoryId",
              type: "auto",
              initial: product.category?.id ?? "",
              lookup: {
                noun: "category",
                picked: product.category ? { id: product.category.id, label: product.category.path } : null,
              },
              parse: (value) => value || null,
              requires: UPDATE,
            },
          },
          {
            key: "id-check",
            label: "ID check",
            value: idCheckWords(product),
            // A category that checks ID checks it for every product in it.
            ...(product.category?.ageCheck
              ? {}
              : {
                  edit: {
                    field: "ageCheck",
                    type: "seg" as const,
                    options: ["Yes", "No"],
                    initial: product.ownAgeCheck ? "Yes" : "No",
                    parse: parseIdCheck,
                    requires: UPDATE,
                  },
                }),
          },
          ...(product.depositsOn
            ? [
                {
                  key: "deposit",
                  label: "Deposit",
                  value: depositWords(product),
                  mono: product.returnable && Boolean(product.depositAmount),
                  edit: {
                    field: "depositAmount",
                    type: "money" as const,
                    initial: product.returnable && product.depositAmount !== null ? product.depositAmount.toFixed(2) : "",
                    parse: (text: string) => figure(text, { optional: true }),
                    requires: UPDATE,
                  },
                },
              ]
            : []),
        ],
      },
    ];
  },
  invalidates: [["retail-catalog"], ["reports"], ["list", "retail-bin"], ["list", "retail-products"]],
};
