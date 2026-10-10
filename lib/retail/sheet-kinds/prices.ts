import { z } from "zod";

import type { PriceListView } from "@/lib/retail/price-lists/service";
import type { PreviewLine } from "@/lib/retail/prices/preview";
import { addDays, formatCount, formatMoney, todayIn } from "@/lib/workspace/format";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

import { readJson } from "./products";

/**
 * A price list's prices (PRD-07, 20-products W-14 to W-16): Change many
 * prices (`BulkPrice.png`) over the worksheet's ticked rows or Products' for
 * the default list; Add products to a list (`AddToList.png`), from the
 * worksheet's primary or Products' ticked rows; and on a phone the one-field
 * price of a worksheet row.
 */

const UPDATE: Array<["retail.prices", "update"]> = [["retail.prices", "update"]];
const invalidatePrices = [
  ["list", "retail-prices"],
  ["list", "retail-price-lists"],
  ["list", "retail-products"],
  ["lookup", "product"],
  ["lookup", "price-list"],
  ["retail-product"],
  ["record-activity"],
];

const idsOf = (ctx: SheetCtx): string[] => {
  const many = ctx.params.get("ids");
  if (many) return [...new Set(many.split(",").filter(Boolean))];
  return ctx.id ? [ctx.id] : [];
};
const productWords = (n: number) => `${formatCount(n)} ${n === 1 ? "product" : "products"}`;
const priceWords = (n: number) => `${formatCount(n)} ${n === 1 ? "price" : "prices"}`;
const messageOf = (payload: unknown, fallback: string) => String((payload as { message?: string } | null)?.message ?? fallback);

/** The default list, as Products' ticked rows change its prices: the price-list option whose sub says Default. */
async function defaultList(): Promise<PickedOption | null> {
  const page = await readJson<{ options: PickedOption[] }>(`/api/v2/retail/lookup/price-list?q=&limit=50`);
  return page.options.find((option) => option.sub?.startsWith("Default")) ?? null;
}

/* ──────────────────────────────────────────────────────────────────────────
   Change many prices
   ────────────────────────────────────────────────────────────────────────── */

const HOW_SEG = ["Raise by a percentage", "Set a margin", "Set one price"];
const HOW_OF_SEG: Record<string, "RAISE" | "MARGIN" | "ONE_PRICE"> = {
  "Raise by a percentage": "RAISE",
  "Set a margin": "MARGIN",
  "Set one price": "ONE_PRICE",
};
const ROUND_SEG = ["No", "Up to 5 cents", "Up to 10 cents"];
const ROUND_OF_SEG: Record<string, "NO" | "UP_5" | "UP_10"> = { No: "NO", "Up to 5 cents": "UP_5", "Up to 10 cents": "UP_10" };
const WHEN_SEG = ["Now", "Tonight, after closing", "On a date"];
const WHEN_OF_SEG: Record<string, "NOW" | "TONIGHT" | "DATE"> = { Now: "NOW", "Tonight, after closing": "TONIGHT", "On a date": "DATE" };

const percentSchema = z.string().regex(/^\s*-?\d{1,4}(\.\d{1,2})?\s*%?\s*$/, "Write it as a percentage, like 5%.");

/** "US$1.20 now, margin 28%", and "· below cost" on a line the new price puts under its cost. */
export function lineSub(line: Pick<PreviewLine, "now" | "margin" | "belowCost" | "note">): string {
  const now = `${formatMoney(line.now)} now`;
  const margin = line.margin === null ? null : `margin ${Math.round(line.margin)}%`;
  return [[now, margin].filter(Boolean).join(", "), line.note, line.belowCost ? "below cost" : null].filter(Boolean).join(" · ");
}

/** The lines as the preview says, each keeping its Labels as typed. */
export function linesFromPreview(preview: PreviewLine[], current: SheetLine[]): SheetLine[] {
  const labels = new Map(current.map((line) => [line.productId, line.quantity]));
  return preview.map((line) => ({
    productId: line.productId,
    name: line.name,
    sub: lineSub(line),
    warn: line.belowCost,
    quantity: labels.get(line.productId) ?? "1",
    cost: line.next.toFixed(2),
  }));
}

/** What the preview is asked with, or null while "By" is not yet a figure. */
function previewBody(values: SheetValues): Record<string, unknown> | null {
  const how = HOW_OF_SEG[String(values.how)] ?? "RAISE";
  const by = how === "ONE_PRICE" ? String(values.price ?? "") : String(values.by ?? "");
  const lines = Array.isArray(values.lines) ? (values.lines as SheetLine[]) : [];
  if (!values._listId || lines.length === 0 || by.trim() === "") return null;
  if (how !== "ONE_PRICE" && !percentSchema.safeParse(by).success) return null;
  return {
    listId: values._listId,
    productIds: lines.map((line) => line.productId),
    how,
    by,
    round: ROUND_OF_SEG[String(values.round)] ?? "NO",
  };
}

async function preview(body: Record<string, unknown>): Promise<PreviewLine[] | null> {
  const response = await fetch("/api/v2/retail/price-changes/preview", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return ((await response.json()) as { lines: PreviewLine[] }).lines;
}

/** Every change re-reads the lines, once the typing has stopped for 300ms. */
let previewSeq = 0;
async function followPreview(_value: unknown, values: SheetValues): Promise<SheetValues | null> {
  const mine = ++previewSeq;
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (mine !== previewSeq) return null;
  const body = previewBody(values);
  if (!body) return null;
  const lines = await preview(body);
  if (!lines || mine !== previewSeq) return null;
  return { lines: linesFromPreview(lines, values.lines as SheetLine[]) };
}

/** Change many prices' fields as the opener asks: "Round to 5 cents" opens a raise of 0% rounded up to 5 cents. */
export function bulkPriceStart(how: string | null): SheetValues {
  if (how === "MARGIN") return { how: "Set a margin", by: "30%", round: "Up to 5 cents" };
  if (how === "ONE_PRICE") return { how: "Set one price", round: "No" };
  if (how === "ROUND") return { how: "Raise by a percentage", by: "0%", round: "Up to 5 cents" };
  return { how: "Raise by a percentage", by: "5%", round: "Up to 5 cents" };
}

const tomorrow = () => addDays(todayIn("Africa/Harare"), 1);

const bulkPrice: SheetKind = {
  title: (_ctx, values) => `Change ${priceWords(Array.isArray(values.lines) ? (values.lines as SheetLine[]).length : 0)}`,
  sub: (ctx, values) => `${String(values._list ?? "Retail")} price list · ${formatCount(idsOf(ctx).length)} ticked`,
  wide: true,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "how", t: "seg", l: "How", o: HOW_SEG, v: HOW_SEG[0], follow: followPreview },
        {
          id: "by",
          t: "text",
          l: "By",
          mono: true,
          half: true,
          v: "5%",
          show: (values) => values.how !== "Set one price",
          schema: percentSchema,
          follow: followPreview,
        },
        { id: "price", t: "money", l: "Price", half: true, show: (values) => values.how === "Set one price", follow: followPreview },
        { id: "round", t: "seg", l: "Then round", half: true, o: ROUND_SEG, v: "Up to 5 cents", follow: followPreview },
      ],
    },
    {
      title: "What changes",
      fields: [
        {
          id: "lines",
          t: "lines",
          l: "What changes",
          nolabel: true,
          noun: "product",
          ql: "Labels",
          cl: "New price",
          // Only products already on this list can change price on it.
          context: (_ctx, values) => ({ onList: String(values._listId ?? "") }),
          needed: "Add the products to change.",
          follow: followPreview,
        },
      ],
    },
    {
      title: "When",
      fields: [
        { id: "when", t: "seg", l: "When", o: WHEN_SEG, v: "Tonight, after closing" },
        {
          id: "date",
          t: "date",
          l: "From",
          earliest: () => tomorrow(),
          needed: "Pick a date from tomorrow.",
          show: (values) => values.when === "On a date",
        },
        { id: "printLabels", t: "toggle", l: "Print new shelf labels", v: true, show: (values) => values._tillPrinter === true },
      ],
    },
  ],
  note: "Old prices are kept in each product’s history.",
  primary: (values) => `Change ${priceWords(Array.isArray(values.lines) ? (values.lines as SheetLine[]).length : 0)}`,
  load: async (ctx) => {
    const listId = ctx.params.get("list");
    const list = listId ? await readJson<PriceListView>(`/api/v2/retail/price-lists/${encodeURIComponent(listId)}`) : null;
    const fallback = list ? null : await defaultList();
    const id = list?.id ?? fallback?.id ?? null;
    const start = bulkPriceStart(ctx.params.get("how"));
    const printer = await readJson<{ options: PickedOption[] }>(
      `/api/v2/retail/lookup/printer?context=${encodeURIComponent(JSON.stringify({ pick: "default" }))}`,
    ).catch(() => ({ options: [] as PickedOption[] }));
    const values: SheetValues = {
      ...start,
      _listId: id,
      _list: list?.name ?? fallback?.label ?? "Retail",
      _tillPrinter: Boolean(printer.options[0] && printer.options[0].id !== "here"),
    };
    const ids = idsOf(ctx);
    const body = previewBody({ ...values, lines: ids.map((productId) => ({ productId, name: "", sub: null, quantity: "1", cost: "" })) });
    const lines = body ? await preview(body) : null;
    return { ...values, lines: lines ? linesFromPreview(lines, []) : [] };
  },
  submit: (values) => {
    const lines = Array.isArray(values.lines) ? (values.lines as SheetLine[]) : [];
    const when = WHEN_OF_SEG[String(values.when)] ?? "TONIGHT";
    return {
      method: "POST",
      url: "/api/v2/retail/price-changes",
      body: {
        listId: values._listId,
        lines: lines.map((line) => ({ productId: line.productId, price: line.cost, labels: Math.max(0, Math.trunc(Number(line.quantity) || 0)) })),
        when,
        date: when === "DATE" ? values.date : null,
        printLabels: values._tillPrinter === true && values.printLabels === true,
      },
    };
  },
  done: (_result, _values, payload) => messageOf(payload, "Prices changed."),
  // While the batch waits, the toast can take it back.
  undo: (result) => {
    const data = result as { batchId?: string; applied?: boolean } | null;
    return data?.batchId && data.applied === false
      ? {
          label: "Undo",
          request: { method: "POST", url: `/api/v2/retail/price-changes/${data.batchId}/cancel` },
          // "Undone. The prices stay as they are.", and the shelves to see to when the labels printed already.
          done: (payload) => messageOf(payload, "Undone. The prices stay as they are."),
        }
      : null;
  },
  open: (result) => (result as { pdfUrl?: string | null } | null)?.pdfUrl ?? null,
  openLabel: "Print labels",
  invalidate: invalidatePrices,
  requires: UPDATE,
};

/* ──────────────────────────────────────────────────────────────────────────
   Add products to a price list
   ────────────────────────────────────────────────────────────────────────── */

const pricedAtSeg = (base: string) => [`The ${base} price`, `${base} less a percentage`, "Set each one"];
const PRICED_AT = ["BASE", "BASE_LESS", "EACH"] as const;

/** The seg's choice as the list's own rule prices it: its base as it is, or less its percentage. */
export function listRule(view: Pick<PriceListView, "basis" | "adjustPercent" | "baseName">): { pricedAt: string; less: string } {
  const [base, less] = pricedAtSeg(view.baseName);
  if (view.basis === "LIST" && view.adjustPercent !== null && view.adjustPercent < 0) {
    return { pricedAt: less!, less: `${-view.adjustPercent}%` };
  }
  return { pricedAt: base!, less: "10%" };
}

function listFacts(view: PriceListView): SheetValues {
  return {
    _listId: view.id,
    _list: view.name,
    _base: view.baseName,
    _products: view.products,
    _minQuantity: view.minQuantity,
    ...listRule(view),
    fromQuantity: String(view.minQuantity),
  };
}

const readList = (id: string) => readJson<PriceListView>(`/api/v2/retail/price-lists/${encodeURIComponent(id)}`);

const lessSchema = z.string().refine((value) => {
  const match = /^\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?\s*$/.exec(value);
  return Boolean(match) && Number(match![1]) <= 90;
}, "Make it 0% to 90%.");
const quantitySchema = z.string().regex(/^\s*[1-9]\d{0,3}\s*$/, "From 1 unit up.");

const fromProducts = (ctx: SheetCtx) => !ctx.id && idsOf(ctx).length > 0;
const pickedOf = (values: SheetValues) => (Array.isArray(values.products) ? (values.products as PickedOption[]) : []);

const listField: FieldSpec = {
  id: "listId",
  t: "auto",
  l: "Price list",
  noun: "price-list",
  context: { notDefault: true },
  show: (_values, ctx) => fromProducts(ctx),
  needed: "Pick the price list.",
  follow: async (value) => {
    const picked = value as PickedOption | null;
    return picked ? listFacts(await readList(picked.id)) : null;
  },
};

const priceListAdd: SheetKind = {
  title: (ctx, values) => (fromProducts(ctx) ? "Add products to a price list" : `Add products to ${String(values._list ?? "the list")}`),
  sub: (ctx, values) =>
    fromProducts(ctx)
      ? `${productWords(idsOf(ctx).length)} ticked`
      : `${String(values._list ?? "")} price list · ${productWords(Number(values._products ?? 0))}`,
  cur: "US$",
  sections: [
    {
      fields: [
        listField,
        {
          id: "products",
          t: "tags",
          l: "Products",
          noun: "product",
          p: "Search, scan, or tick in Products, then Enter",
          // Products already on the list are not offered again.
          context: (_ctx, values) => (values._listId ? { listId: String(values._listId) } : {}),
          needed: "Pick the products to add.",
        },
        {
          id: "pricedAt",
          t: "seg",
          l: "Priced at",
          o: (values) => pricedAtSeg(String(values._base ?? "Retail")),
          v: "The Retail price",
        },
        {
          id: "less",
          t: "text",
          l: "Less",
          mono: true,
          half: true,
          v: "10%",
          show: (values) => values.pricedAt === pricedAtSeg(String(values._base ?? "Retail"))[1],
          schema: lessSchema,
        },
        {
          id: "fromQuantity",
          t: "text",
          l: "From quantity",
          mono: true,
          half: true,
          v: "1",
          h: (values) =>
            Number(values._minQuantity ?? 1) > 1 ? `${String(values._list ?? "These")} prices start at ${Number(values._minQuantity)} units.` : "",
          schema: quantitySchema,
        },
      ],
    },
  ],
  note: "Prices can be changed in the list afterwards.",
  primary: (values) => `Add ${productWords(pickedOf(values).length)}`,
  load: async (ctx) => {
    const ids = idsOf(ctx);
    if (!fromProducts(ctx)) return ctx.id ? listFacts(await readList(ctx.id)) : {};
    // From Products: the ticked rows, named, in the tags.
    const page = await readJson<{ options: PickedOption[] }>(
      `/api/v2/retail/lookup/product?q=&limit=50&context=${encodeURIComponent(JSON.stringify({ ids }))}`,
    );
    return { products: page.options.map((option) => ({ id: option.id, label: option.label, sub: option.sub ?? null })) };
  },
  submit: (values) => {
    const index = pricedAtSeg(String(values._base ?? "Retail")).indexOf(String(values.pricedAt));
    const pricedAt = PRICED_AT[Math.max(0, index)];
    return {
      method: "POST",
      url: `/api/v2/retail/price-lists/${encodeURIComponent(String(values._listId ?? ""))}/products`,
      body: {
        productIds: pickedOf(values).map((option) => option.id),
        pricedAt,
        less: pricedAt === "BASE_LESS" ? String(values.less ?? "") : null,
        fromQuantity: Number(String(values.fromQuantity ?? "").trim()) || null,
      },
    };
  },
  done: (_result, _values, payload) => messageOf(payload, "Products added."),
  invalidate: invalidatePrices,
  requires: UPDATE,
};

/* ──────────────────────────────────────────────────────────────────────────
   One price, on a phone
   ────────────────────────────────────────────────────────────────────────── */

const priceEdit: SheetKind = {
  title: "Change the price",
  sub: (_ctx, values) => `${String(values._list ?? "")} price list`,
  cur: "US$",
  sections: [{ fields: [{ id: "price", t: "money", l: "Price", lw: (values) => String(values._name ?? "Price") }] }],
  note: (values) => (values._refused ? String(values._refused) : "The till picks it up the moment you save."),
  primary: "Save price",
  load: async (ctx) => {
    const listId = ctx.params.get("list") ?? "";
    const [list, lines] = await Promise.all([
      readList(listId),
      preview({ listId, productIds: [ctx.id], how: "RAISE", by: "0", round: "NO" }),
    ]);
    const line = lines?.[0];
    const price = line ? line.now.toFixed(2) : "";
    return { _list: list.name, _listId: list.id, _name: line?.name ?? "", price, _was: price };
  },
  onRefused: (payload) => {
    const rows = (payload as { details?: { rows?: Array<{ message: string }> } } | null)?.details?.rows ?? [];
    return rows[0] ? { _refused: rows[0].message } : null;
  },
  submit: (values, ctx) => ({
    method: "PATCH",
    url: `/api/v2/retail/price-lists/${encodeURIComponent(String(values._listId ?? ""))}/prices`,
    body: { changes: [{ id: ctx.id, value: String(values.price ?? ""), was: String(values._was ?? "") }] },
  }),
  done: (_result, _values, payload) => messageOf(payload, "Saved."),
  invalidate: invalidatePrices,
  requires: UPDATE,
};

export const PRICE_SHEETS: Record<string, SheetKind> = {
  "bulk-price": bulkPrice,
  "price-list-add": priceListAdd,
  "price-edit": priceEdit,
};
