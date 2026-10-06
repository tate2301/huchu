import { fetchJson } from "@/lib/api-client";
import { archiveAsk } from "@/lib/retail/asks/products";
import type { ProductView } from "@/lib/retail/products/view";
import { formatCount, formatMoney, formatSignedCount } from "@/lib/workspace/format";

import type { Grant, RecordKind } from "./types";

/**
 * The product record kind (00-foundations 5.6.10, Product board): the
 * reference for the details rail edited in place and for the bin. The rail's
 * groups are the board's; Edit opens the Edit a product sheet over it; an
 * archived product says so under the header with "Sell it again". The
 * products spec adds its KPIs, chart and tabs (PRD-04).
 */

const UPDATE: Grant = ["retail.catalog", "update"];
const VIEW: Grant = ["retail.catalog", "view"];

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

export const productKind: RecordKind<ProductView> = {
  type: "Product",
  back: { label: "Products", href: "/retail/products" },
  queryKey: (id) => ["retail-product", id],
  load: async (id) => (await fetchJson<{ data: ProductView }>(productUrl(id))).data,
  endpoint: productUrl,
  title: (product) => product.name,
  reference: (product) => product.code,
  actions: (product) => [
    { key: "edit", label: "Edit", requires: [UPDATE], do: { sheet: "product-edit", id: product.id } },
    // STK-04 replaces this with its own case-break sheet.
    ...(product.packOf
      ? [{ key: "break-case", label: "Open cases into singles", requires: [["retail.stock", "update"] as Grant], do: { event: "break-case" } }]
      : []),
  ],
  more: (product) => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/Product/${product.id}/pdf` } },
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
  bin: { kind: "product", deleteRight: ["retail.catalog", "delete"], state: (product) => product.bin },
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
    ...(!product.isActive && !product.archivedAt ? [{ label: "Archived", tone: "plain" as const }] : []),
    ...(product.category ? [{ label: product.category.name, tone: "plain" as const }] : []),
    ...(product.ageCheck ? [{ label: "ID check at the till", tone: "plain" as const }] : []),
  ],
  figure: (product) => ({ label: "Selling at", value: formatMoney(product.price, product.currency) }),
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
      edit: { field: "imageUrl", upload: (file) => uploadPhoto(file), requires: UPDATE },
    },
  }),
  rail: (product) => {
    const reorder = product.stock.reorderAt;
    const reorderQty = product.stock.reorderQty;
    const units = (count: number) => `${formatCount(count)} ${product.unit}${count === 1 || product.unit === "each" ? "" : "s"}`;
    return [
      {
        title: "Price",
        rows: [
          {
            key: "price",
            label: "Price",
            value: formatMoney(product.price, product.currency),
            mono: true,
            ...(product.canEdit.price
              ? { edit: { field: "price", type: "money" as const, initial: product.price.toFixed(2), parse: (text: string) => figure(text), requires: UPDATE } }
              : {}),
          },
          {
            key: "cost",
            label: "Cost",
            value: product.cost === null ? "—" : formatMoney(product.cost, product.currency),
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
          {
            key: "price-lists",
            label: "Price lists",
            value: product.otherLists.length
              ? product.otherLists.map((list) => `${list.name} ${formatMoney(list.price, list.currency)}`).join(", ")
              : `On the ${product.listName} list only`,
            muted: product.otherLists.length === 0,
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
              field: "reorderAt",
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
            edit: { field: "code", type: "text", mono: true, initial: product.code, parse: needed("Code"), requires: UPDATE },
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
          { key: "id-check", label: "ID check", value: product.ageCheck ? "Yes, 18 and over" : "No" },
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
  invalidates: [["retail-catalog"], ["reports"], ["list", "retail-bin"], ["list", "retail-products"]],
};
