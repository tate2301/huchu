import { fetchJson } from "@/lib/api-client";
import type { ProductRecord } from "@/lib/retail/product-record";
import { formatCount, formatMoney, formatSignedCount } from "@/lib/workspace/format";

import type { Grant, RecordKind } from "./types";

/**
 * The product record kind (00-foundations 5.6.10, Product board): the
 * reference for the details rail edited in place and for the bin. The rail's
 * groups are the board's; the strip's chips and figure are the facts the
 * product already has. The products spec adds its KPIs, chart, tabs and the
 * stock and buying actions.
 */

const UPDATE: Grant = ["retail.catalog", "update"];
const VIEW: Grant = ["retail.catalog", "view"];

/** "18.50" → 18.5. A blank or a word is refused in words. */
function figure(text: string, { optional = false } = {}): number | null {
  const trimmed = text.trim().replace(/,/g, "").replace(/^US\$/, "");
  if (!trimmed) {
    if (optional) return null;
    throw new Error("Give a figure, like 18.50.");
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) throw new Error("Write it as a figure, zero or more, like 18.50.");
  return value;
}

function needed(label: string) {
  return (text: string) => {
    if (!text.trim()) throw new Error(`${label} is needed.`);
    return text.trim();
  };
}

function soldAs(product: ProductRecord): string {
  if (product.soldAs.single) return `Case of ${product.packSize ?? "?"} ${product.soldAs.single.name}`;
  if (product.soldAs.cases.length) {
    return `Single; ${product.soldAs.cases.map((pack) => `case of ${pack.packSize ?? "?"}`).join(", ")}`;
  }
  return "Single";
}

async function uploadPhoto(productId: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  body.append("productId", productId);
  const response = await fetch("/api/v2/retail/catalog/image", { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "That picture could not be saved. Try again.");
  const url: string | undefined = payload?.data?.url ?? payload?.url;
  if (!url) throw new Error("The upload finished but returned no address.");
  return url;
}

export const productKind: RecordKind<ProductRecord> = {
  type: "Product",
  back: { label: "Products", href: "/retail/products" },
  queryKey: (id) => ["retail-catalog-item", id],
  load: (id) => fetchJson<ProductRecord>(`/api/v2/retail/catalog/${id}`),
  endpoint: (id) => `/api/v2/retail/catalog/${id}`,
  title: (product) => product.name,
  reference: (product) => product.sku,
  actions: (product) => [
    { key: "edit", label: "Edit", requires: [UPDATE], do: { event: "edit" } },
    ...(product.packOf
      ? [{ key: "break-case", label: "Open cases into singles", requires: [["retail.stock", "update"] as Grant], do: { event: "break-case" } }]
      : []),
  ],
  more: (product) => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/Product/${product.id}/pdf` } },
  ],
  bin: { kind: "product", deleteRight: ["retail.catalog", "delete"], state: (product) => product.bin },
  chips: (product) => [
    ...(product.status === "INACTIVE" ? [{ label: "Off sale", tone: "warn" as const }] : []),
    ...(product.category ? [{ label: product.category, tone: "plain" as const }] : []),
    ...(product.ageRestricted ? [{ label: "ID check at the till", tone: "plain" as const }] : []),
  ],
  figure: (product) => ({ label: "Selling at", value: formatMoney(product.unitPrice, product.currency) }),
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
    { key: "activity", label: "Activity" },
  ],
  railTop: (product) => ({
    photo: {
      url: product.imageUrl,
      prompt: "Add a photo",
      sub: "The till shows it on the product button",
      edit: { field: "imageUrl", upload: (file) => uploadPhoto(product.id, file), requires: UPDATE },
    },
  }),
  rail: (product) => {
    const unit = product.inventoryItem?.unit ?? "unit";
    const reorder = product.inventoryItem?.reorderLevel ?? null;
    const reorderQty = product.inventoryItem?.reorderQty ?? null;
    const units = (count: number) => `${formatCount(count)} ${unit}${count === 1 ? "" : "s"}`;
    return [
      {
        title: "Price",
        rows: [
          {
            key: "price",
            label: "Price",
            value: formatMoney(product.unitPrice, product.currency),
            mono: true,
            edit: { field: "unitPrice", type: "money", initial: product.unitPrice.toFixed(2), parse: (text) => figure(text), requires: UPDATE },
          },
          {
            key: "cost",
            label: "Cost",
            value: product.costPrice === null ? "—" : formatMoney(product.costPrice, product.currency),
            mono: product.costPrice !== null,
            muted: product.costPrice === null,
            visible: ["retail.catalog", "view-cost"],
            edit: {
              field: "costPrice",
              type: "money",
              initial: product.costPrice === null ? "" : product.costPrice.toFixed(2),
              parse: (text) => figure(text, { optional: true }),
              requires: UPDATE,
            },
          },
          {
            key: "vat",
            label: "VAT",
            value: `${product.taxPercent}%${product.taxInclusive ? " included" : " added at the till"}`,
            edit: {
              field: "taxPercent",
              type: "number",
              initial: String(product.taxPercent),
              parse: (text) => {
                const rate = figure(text) as number;
                if (rate > 100) throw new Error("VAT is a percentage up to 100.");
                return rate;
              },
              requires: UPDATE,
            },
          },
          {
            key: "price-lists",
            label: "Price lists",
            value: product.priceLists.length
              ? product.priceLists.map((list) => `${list.name} ${formatMoney(list.unitPrice, list.currency)}`).join(", ")
              : "Only the shelf price",
            muted: product.priceLists.length === 0,
          },
        ],
      },
      {
        title: "Stock",
        rows: [
          {
            key: "reorder-at",
            label: "Reorder at",
            value: reorder === null ? "Never asked" : units(reorder),
            mono: reorder !== null,
            muted: reorder === null,
            edit: {
              field: "reorderLevel",
              type: "number",
              initial: reorder === null ? "" : String(reorder),
              parse: (text) => figure(text, { optional: true }),
              requires: UPDATE,
            },
          },
          {
            key: "reorder",
            label: "Reorder",
            value: reorderQty === null ? "Not set" : units(reorderQty),
            mono: reorderQty !== null,
            muted: reorderQty === null,
            edit: {
              field: "reorderQty",
              type: "number",
              initial: reorderQty === null ? "" : String(reorderQty),
              parse: (text) => figure(text, { optional: true }),
              requires: UPDATE,
            },
          },
          { key: "sold-as", label: "Sold as", value: soldAs(product) },
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
            value: product.sku,
            mono: true,
            edit: { field: "sku", type: "text", mono: true, initial: product.sku, parse: needed("Code"), requires: UPDATE },
          },
          {
            key: "barcode",
            label: "Barcode",
            value: product.barcode ?? "Not on file",
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
            value: product.category ?? "None",
            muted: !product.category,
            edit: {
              field: "categoryId",
              type: "auto",
              initial: product.categoryId ?? "",
              lookup: {
                noun: "category",
                picked: product.categoryId && product.category ? { id: product.categoryId, label: product.category } : null,
              },
              parse: (value) => value || null,
              requires: UPDATE,
            },
          },
          { key: "id-check", label: "ID check", value: product.ageRestricted ? "Yes, 18 and over" : "No" },
          product.returnable
            ? {
                key: "deposit",
                label: "Deposit",
                value: product.depositAmount === null ? "Returnable, no deposit set" : formatMoney(product.depositAmount),
                mono: product.depositAmount !== null,
                edit: {
                  field: "depositAmount",
                  type: "money",
                  initial: product.depositAmount === null ? "" : product.depositAmount.toFixed(2),
                  parse: (text) => figure(text, { optional: true }),
                  requires: UPDATE,
                },
              }
            : { key: "deposit", label: "Deposit", value: "None, not returnable" },
        ],
      },
    ];
  },
  invalidates: [["retail-catalog"], ["reports"], ["retail-bin"]],
};
