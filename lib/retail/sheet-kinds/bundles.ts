import { z } from "zod";

import { bundleStopAsk } from "@/lib/retail/asks/products";
import type { BundleView } from "@/lib/retail/bundles/service";
import type { ProductNewContext } from "@/lib/retail/products/context";
import type { ProductView } from "@/lib/retail/products/view";
import { formatCount, formatMoney } from "@/lib/workspace/format";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

import { readJson } from "./products";

/**
 * Bundles and packs' sheets (PRD-08, 20-products 5.13–5.15): Sell by the case
 * (`pack-new`), New bundle (`bundle-new`, a fixed set or a buy-more deal) and
 * a bundle (`bundle-edit`).
 */

const invalidateBundles = [["list", "retail-bundles"], ["list", "retail-products"], ["retail-bundle"], ["reports"]];

/** "26.00" or "US$ 26.00" as a figure; NaN when it is not one. */
const figure = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.]/g, "") || "NaN");
const money = (value: number) => formatMoney(Math.round(value * 100) / 100);

/* ── Sell by the case ─────────────────────────────────────────────────── */

const sizeOf = (values: SheetValues) => {
  const size = Number(String(values.size ?? "").trim());
  return Number.isInteger(size) && size >= 2 && size <= 1000 ? size : null;
};
const singleOf = (values: SheetValues) => (values.single as PickedOption | null) ?? null;

/** "24 singles at US$1.20 come to US$28.80. The case saves US$2.80." */
function caseHint(values: SheetValues): string {
  const single = singleOf(values);
  const size = sizeOf(values);
  const each = figure(single?.cost);
  if (!single || size === null || !Number.isFinite(each)) return "";
  const apart = each * size;
  const price = figure(values.price);
  const lead = `${formatCount(size)} singles at ${money(each)} come to ${money(apart)}.`;
  if (!Number.isFinite(price) || price <= 0) return lead;
  return price < apart ? `${lead} The case saves ${money(apart - price)}.` : `That costs more than ${formatCount(size)} singles.`;
}

const caseCostsMore = (values: SheetValues) => {
  const single = singleOf(values);
  const size = sizeOf(values);
  const price = figure(values.price);
  return Boolean(single && size !== null && Number.isFinite(price) && price > 0 && price >= figure(single.cost) * size);
};

/** A product as the single lookup offers it: "Beer · 6001108", its price on the default list. */
const singleOption = (view: ProductView): PickedOption => ({
  id: view.id,
  label: view.name,
  sub: [view.category?.name, view.barcode?.slice(0, 7)].filter(Boolean).join(" · ") || null,
  cost: view.price.toFixed(2),
});

const packNew: SheetKind = {
  title: "Sell by the case",
  sub: (_ctx, values) => singleOf(values)?.label ?? "Pick the single",
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "single", t: "auto", l: "The single", noun: "product", context: { singles: true, priced: true }, needed: "Pick the single." },
        {
          id: "size",
          t: "text",
          l: "Singles in a case",
          half: true,
          mono: true,
          right: true,
          max: 4,
          v: "24",
          // Beer and ciders come in 24s; most else in 12s.
          derive: (values) => (/^(beer|cider)/i.test(singleOf(values)?.sub ?? "") || !singleOf(values) ? "24" : "12"),
          schema: z.string().refine((value) => /^\d+$/.test(value.trim()) && Number(value) >= 2 && Number(value) <= 1000, "A case holds 2 to 1,000."),
        },
        {
          id: "called",
          t: "read",
          l: "The case is called",
          half: true,
          derive: (values) => (singleOf(values) && sizeOf(values) ? `${singleOf(values)!.label}, case of ${sizeOf(values)}` : "—"),
        },
        { id: "price", t: "money", l: "Case price", half: true, h: caseHint, warn: caseCostsMore, needed: "Give the case a price." },
        { id: "barcode", t: "text", l: "Case barcode", half: true, mono: true, opt: true, p: "Optional" },
        {
          id: "breakAtTill",
          t: "toggle",
          l: "Break cases at the till",
          v: true,
          h: (values) =>
            `When the singles run out, the cashier opens a case: one case comes off, ${formatCount(sizeOf(values) ?? 24)} singles go in.`,
        },
        {
          id: "deposit",
          t: "money",
          l: "Deposit on the crate",
          half: true,
          opt: true,
          optQuiet: true,
          h: "Empties and deposits are on for liquor stores.",
          show: (values) => values._depositsOn === true,
        },
      ],
    },
  ],
  note: (values) => `Cases and singles are counted apart. Opening a case moves ${formatCount(sizeOf(values) ?? 24)} into singles.`,
  primary: "Add the case",
  done: (_result, _values, payload) => String((payload as { message?: string } | null)?.message ?? "The case is on sale."),
  open: (result) => `/retail/products/${(result as ProductView).id}`,
  load: async (ctx) => {
    const singleId = ctx.params.get("single");
    const [context, single] = await Promise.all([
      readJson<ProductNewContext>("/api/v2/retail/products/new-context"),
      singleId ? readJson<ProductView>(`/api/v2/retail/products/${encodeURIComponent(singleId)}`) : Promise.resolve(null),
    ]);
    return { _depositsOn: context.depositsOn, ...(single ? { single: singleOption(single) } : {}) };
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/packs",
    body: {
      singleId: singleOf(values)?.id ?? "",
      size: Number(String(values.size ?? "").trim()),
      price: String(values.price ?? ""),
      barcode: String(values.barcode ?? "").trim() || null,
      breakAtTill: values.breakAtTill === true,
      crateDeposit: String(values.deposit ?? "").trim() || null,
    },
  }),
  invalidate: invalidateBundles,
  requires: [["retail.catalog", "create"]],
};

/* ── New bundle, and a bundle ─────────────────────────────────────────── */

const KIND_SEG = ["A fixed set", "Buy more, pay less"];
const KIND_OF_SEG: Record<string, "FIXED_SET" | "BUY_MORE"> = { "A fixed set": "FIXED_SET", "Buy more, pay less": "BUY_MORE" };
const DAYS_SEG = ["Every day", "Weekends", "Choose days"];
const DAYS_OF_SEG: Record<string, "EVERY_DAY" | "WEEKENDS" | "CHOOSE"> = { "Every day": "EVERY_DAY", Weekends: "WEEKENDS", "Choose days": "CHOOSE" };
const SEG_OF_DAYS = { EVERY_DAY: "Every day", WEEKENDS: "Weekends", CHOOSE: "Choose days" } as const;

const buyMore = (values: SheetValues) => values.kind === "Buy more, pay less" || values._kind === "BUY_MORE";
const linesOf = (values: SheetValues) => (Array.isArray(values.items) ? (values.items as SheetLine[]) : []);
const qty = (line: SheetLine) => Math.max(0, Math.floor(figure(line.quantity) || 0));
const anyOf = (values: SheetValues) => {
  const any = Number(String(values.buyQuantity ?? "").trim());
  return Number.isInteger(any) && any >= 2 ? any : null;
};

/** What they come to bought apart: each line's price times how many; for buy more, Any of the dearest. */
function boughtApart(values: SheetValues): number | null {
  const lines = linesOf(values);
  if (lines.length === 0) return null;
  if (buyMore(values)) {
    const any = anyOf(values);
    return any === null ? null : any * Math.max(...lines.map((line) => figure(line.cost) || 0));
  }
  return lines.reduce((sum, line) => sum + (figure(line.cost) || 0) * qty(line), 0);
}

/** "Saves US$1.00. Margin 18.4%." (margin only for someone who may see cost); buy more "3 bought apart: US$5.55. Saves US$0.55." */
function priceHint(values: SheetValues): string {
  const apart = boughtApart(values);
  const price = figure(values.price);
  if (apart === null || !Number.isFinite(price) || price <= 0) return "";
  const saves = apart - price;
  if (saves <= 0) return buyMore(values) ? `${anyOf(values)} bought apart come to ${money(apart)}: that is not a saving.` : `That is not a saving: bought apart they come to ${money(apart)}.`;
  if (buyMore(values)) return `${anyOf(values)} bought apart: ${money(apart)}. Saves ${money(saves)}.`;
  const costs = values._costs as Record<string, number> | undefined;
  const lines = linesOf(values);
  const known = costs && lines.every((line) => costs[line.productId] !== undefined);
  const cost = known ? lines.reduce((sum, line) => sum + costs![line.productId]! * qty(line), 0) : null;
  return `Saves ${money(saves)}.${cost === null ? "" : ` Margin ${(((price - cost) / price) * 100).toFixed(1)}%.`}`;
}

const noSaving = (values: SheetValues) => {
  const apart = boughtApart(values);
  const price = figure(values.price);
  return apart !== null && Number.isFinite(price) && price > 0 && price >= apart;
};

/** The lines' costs, for the margin, read for whoever may see cost. */
async function costsOf(lines: SheetLine[], ctx: SheetCtx): Promise<SheetValues | null> {
  if (!ctx.can("retail.catalog", "view-cost") || lines.length === 0) return { _costs: {} };
  const params = new URLSearchParams({ q: "", limit: "50", context: JSON.stringify({ ids: lines.map((line) => line.productId) }) });
  const page = await readJson<{ options: PickedOption[] }>(`/api/v2/retail/lookup/product?${params.toString()}`);
  const costs: Record<string, number> = {};
  for (const option of page.options) if (option.cost !== null && option.cost !== undefined) costs[option.id] = figure(option.cost);
  return { _costs: costs };
}

const itemsField: FieldSpec = {
  id: "items",
  t: "lines",
  l: "In it",
  noun: "product",
  context: { priced: true },
  ql: "How many",
  cl: "Each",
  priced: true,
  noQuantity: buyMore,
  h: (values) => {
    if (buyMore(values)) return "Any of these count.";
    const apart = boughtApart(values);
    return apart === null ? "" : `Bought apart: ${money(apart)}.`;
  },
  needed: "Put the products in it.",
  follow: async (value, _values, ctx) => costsOf(Array.isArray(value) ? (value as SheetLine[]) : [], ctx),
};

const anyField: FieldSpec = {
  id: "buyQuantity",
  t: "text",
  l: "Any",
  half: true,
  mono: true,
  right: true,
  max: 2,
  v: "3",
  show: buyMore,
  schema: z.string().refine((value) => /^\d+$/.test(value.trim()) && Number(value) >= 2 && Number(value) <= 24, "Any is 2 to 24."),
};

const priceField: FieldSpec = {
  id: "price",
  t: "money",
  l: "Bundle price",
  lw: (values) => (buyMore(values) ? "For" : "Bundle price"),
  half: true,
  h: priceHint,
  warn: noSaving,
  needed: "Give it a price.",
};

const daysField: FieldSpec = { id: "days", t: "seg", l: "On sale", o: DAYS_SEG, v: "Every day", half: true };
const chosenDaysField: FieldSpec = {
  id: "daysOfWeek",
  t: "days",
  l: "Days",
  needed: "Choose at least one day.",
  show: (values) => values.days === "Choose days",
};

/** The body both sheets send for what is in it and its price. */
function bundleBody(values: SheetValues, kind: "FIXED_SET" | "BUY_MORE") {
  return {
    name: String(values.name ?? "").trim(),
    items: linesOf(values).map((line) => ({ productId: line.productId, quantity: kind === "FIXED_SET" ? qty(line) : 1 })),
    ...(kind === "BUY_MORE" ? { buyQuantity: Number(String(values.buyQuantity ?? "").trim()) } : {}),
    price: String(values.price ?? ""),
    days: DAYS_OF_SEG[String(values.days)] ?? "EVERY_DAY",
    daysOfWeek: Array.isArray(values.daysOfWeek) ? (values.daysOfWeek as number[]) : [],
  };
}

/** A bundle's lines as the lines field holds them. */
const linesOfView = (view: BundleView): SheetLine[] =>
  view.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    sub: item.category,
    quantity: String(item.quantity),
    cost: item.each.toFixed(2),
  }));

const bundleUrl = (id: string) => `/api/v2/retail/bundles/${encodeURIComponent(id)}`;

const bundleNew: SheetKind = {
  title: "New bundle",
  sub: "Products › Bundles and packs",
  wide: true,
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "kind",
          t: "seg",
          l: "Kind",
          o: KIND_SEG,
          v: (ctx: SheetCtx) => (ctx.params.get("kind") === "BUY_MORE" ? KIND_SEG[1] : KIND_SEG[0]),
        },
        { id: "name", t: "text", l: "Name", max: 120, needed: "Name is needed." },
        anyField,
      ],
    },
    { title: "What is in it", fields: [itemsField] },
    {
      title: "Price",
      fields: [
        priceField,
        daysField,
        chosenDaysField,
        { id: "until", t: "text", l: "Until", half: true, v: "No end date" },
        { id: "barcode", t: "text", l: "Barcode", half: true, mono: true, opt: true, p: "Optional", show: (values) => !buyMore(values) },
      ],
    },
  ],
  note: "The till offers the bundle when all its items are in a sale.",
  primary: "Add bundle",
  done: (_result, _values, payload) => String((payload as { message?: string } | null)?.message ?? "The bundle is on sale."),
  open: (result) => `/retail/products/bundles/${(result as BundleView).id}`,
  // Duplicate from a bundle's record: its lines and price, as "<name> (copy)".
  load: async (ctx) => {
    const from = ctx.params.get("from");
    if (!from) return {};
    const view = await readJson<BundleView>(bundleUrl(from));
    const items = linesOfView(view);
    return {
      kind: view.kind === "BUY_MORE" ? KIND_SEG[1] : KIND_SEG[0],
      name: `${view.name} (copy)`,
      items,
      buyQuantity: view.buyQuantity ? String(view.buyQuantity) : "3",
      price: view.price.toFixed(2),
      days: SEG_OF_DAYS[view.days],
      daysOfWeek: view.daysOfWeek,
      ...((await costsOf(items, ctx)) ?? {}),
    };
  },
  submit: (values) => {
    const kind = KIND_OF_SEG[String(values.kind)] ?? "FIXED_SET";
    return {
      method: "POST",
      url: "/api/v2/retail/bundles",
      body: {
        kind,
        ...bundleBody(values, kind),
        until: String(values.until ?? "").trim() || null,
        barcode: kind === "FIXED_SET" ? String(values.barcode ?? "").trim() || null : null,
      },
    };
  },
  invalidate: invalidateBundles,
  requires: [["retail.promotions", "create"]],
};

const bundleEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? "A bundle"),
  sub: (_ctx, values) =>
    values._name === undefined
      ? "Products › Bundles and packs"
      : `${String(values._kindLabel)} · sold ${formatCount(Number(values._soldMonth ?? 0))} ${Number(values._soldMonth) === 1 ? "time" : "times"} this month`,
  wide: true,
  cur: "US$",
  sections: [
    { fields: [{ id: "name", t: "text", l: "Name", max: 120, needed: "Name is needed." }, anyField] },
    { title: "What is in it", fields: [itemsField] },
    { title: "Price", fields: [priceField, daysField, chosenDaysField] },
  ],
  note: "Its sales history stays.",
  primary: "Save",
  done: (_result, values, payload) => String((payload as { message?: string } | null)?.message ?? `${String(values.name)} saved.`),
  danger: {
    label: "Stop selling it",
    show: (_ctx, values) => values._name !== undefined,
    ask: (_ctx, values) => bundleStopAsk(String(values._name ?? "it")),
    request: (ctx) => ({ method: "POST", url: `${bundleUrl(ctx.id ?? "")}/stop` }),
    done: (values) => `${String(values._name)} is off every till.`,
  },
  load: async (ctx) => {
    const view = await readJson<BundleView>(bundleUrl(ctx.id ?? ""));
    const items = linesOfView(view);
    return {
      name: view.name,
      items,
      buyQuantity: view.buyQuantity ? String(view.buyQuantity) : "3",
      price: view.price.toFixed(2),
      days: SEG_OF_DAYS[view.days],
      daysOfWeek: view.daysOfWeek,
      _name: view.name,
      _kind: view.kind,
      _kindLabel: view.kindLabel,
      _soldMonth: view.soldMonth,
      ...((await costsOf(items, ctx)) ?? {}),
    };
  },
  submit: (values, ctx) => ({
    method: "PATCH",
    url: bundleUrl(ctx.id ?? ""),
    body: bundleBody(values, values._kind === "BUY_MORE" ? "BUY_MORE" : "FIXED_SET"),
  }),
  invalidate: invalidateBundles,
  requires: [["retail.promotions", "update"]],
};

export const BUNDLE_SHEETS: Record<string, SheetKind> = {
  "pack-new": packNew,
  "bundle-new": bundleNew,
  "bundle-edit": bundleEdit,
};
