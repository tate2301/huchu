import { z } from "zod";

import { promotionEndAsk } from "@/lib/retail/asks/products";
import type { PromotionView } from "@/lib/retail/promotions/service";
import { momentWords, parsePromotionMoment, pickerValue, STATE_WORD, tomorrowStart } from "@/lib/retail/promotions/state";
import { AUDIENCE_SEG, codeFromName, KIND_SEG, SCOPE_SEG, type PromotionKind, type PromotionScope } from "@/lib/retail/promotions/words";
import { formatCount } from "@/lib/workspace/format";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

import { readJson } from "./products";

/**
 * Promotions' sheets (PRD-09, 20-products 5.18 and 5.20): New promotion
 * (`promotion-new`, also a record's Duplicate with `?from=`) and a
 * promotion's rules (`promotion-edit`). Dates come from the shared picker,
 * as shop wall-clock "YYYY-MM-DDTHH:mm".
 */

const invalidatePromotions = [["list", "retail-promotions"], ["retail-promotion"], ["list", "retail-promotion-products"], ["reports"], ["nav-badges"]];

const kindOf = (values: SheetValues): PromotionKind =>
  (KIND_SEG.find(([label]) => label === values.kind)?.[1] ?? (values._kind as PromotionKind | undefined) ?? "PERCENT");
const scopeOf = (values: SheetValues): PromotionScope => SCOPE_SEG.find(([label]) => label === values.appliesTo)?.[1] ?? "EVERYTHING";
const picked = (value: unknown) => (Array.isArray(value) ? (value as PickedOption[]) : []);
const unit = (values: SheetValues) => (values._unitWord ? ` ${String(values._unitWord)}` : "");

const percentSchema = z
  .string()
  .refine((value) => /^\d{1,2}(\.\d{1,2})?\s*%?$/.test(value.trim()) && Number(value.replace("%", "")) > 0 && Number(value.replace("%", "")) <= 90, "Take 1% to 90% off.");
const buySchema = z.string().refine((value) => /^\d+$/.test(value.trim()) && Number(value) >= 2 && Number(value) <= 24, "Buy is 2 to 24.");

/** The value fields, one set a kind; only the kind's own are drawn and sent. */
const valueFields: FieldSpec[] = [
  { id: "percent", t: "text", l: "Off", half: true, mono: true, v: "10%", show: (values) => kindOf(values) === "PERCENT", schema: percentSchema, needed: "Write the percent off, like 10." },
  {
    id: "amount",
    t: "money",
    l: "Off each",
    lw: (values) => `Off each${unit(values)}`,
    half: true,
    show: (values) => kindOf(values) === "AMOUNT",
    needed: "Write how much comes off each.",
  },
  { id: "buy", t: "text", l: "Buy", half: true, mono: true, right: true, max: 2, v: "2", show: (values) => kindOf(values) === "BUY_X_PAY", schema: buySchema },
  { id: "for", t: "money", l: "For", half: true, show: (values) => kindOf(values) === "BUY_X_PAY", needed: "Write what they come to together." },
  { id: "each", t: "money", l: "Each at", half: true, show: (values) => kindOf(values) === "FIXED_PRICE", needed: "Write the price each sells at." },
];

const valueOfFields = (values: SheetValues) => {
  switch (kindOf(values)) {
    case "PERCENT":
      return String(values.percent ?? "").replace("%", "").trim();
    case "AMOUNT":
      return String(values.amount ?? "");
    case "BUY_X_PAY":
      return String(values.for ?? "");
    case "FIXED_PRICE":
      return String(values.each ?? "");
  }
};

/** A promotion's value back into its kind's field. */
function valueFieldsOf(view: PromotionView): SheetValues {
  const text = view.kind === "PERCENT" ? `${Number(view.value.toFixed(2))}%` : view.value.toFixed(2);
  const key = { PERCENT: "percent", AMOUNT: "amount", BUY_X_PAY: "for", FIXED_PRICE: "each" }[view.kind];
  return { [key]: text, ...(view.buyQuantity ? { buy: String(view.buyQuantity) } : {}) };
}

const appliesFields: FieldSpec[] = [
  { id: "appliesTo", t: "seg", l: "Applies to", o: SCOPE_SEG.map(([label]) => label), v: SCOPE_SEG[0]![0] },
  {
    id: "products",
    t: "tags",
    l: "Products",
    noun: "product",
    p: "Search products, then Enter",
    show: (values) => scopeOf(values) === "PRODUCTS",
    needed: "Pick the products it applies to.",
  },
  {
    id: "categories",
    t: "tags",
    l: "Categories",
    noun: "category",
    p: "Add a category, then Enter",
    show: (values) => scopeOf(values) === "CATEGORIES",
    needed: "Pick the categories it applies to.",
  },
];

/** What both sheets send for what it applies to. */
const appliesBody = (values: SheetValues) => {
  const scope = scopeOf(values);
  return {
    appliesTo: scope,
    productIds: scope === "PRODUCTS" ? picked(values.products).map((option) => option.id) : [],
    categoryIds: scope === "CATEGORIES" ? picked(values.categories).map((option) => option.id) : [],
  };
};

const endsField: FieldSpec = {
  id: "ends",
  t: "datetime",
  l: "Ends",
  half: true,
  opt: true,
  optQuiet: true,
  clearable: true,
  p: "No end date",
  earliest: "today",
};

const startsNow = (values: SheetValues) => {
  const at = typeof values.starts === "string" ? parsePromotionMoment(values.starts) : null;
  return at !== null && at.getTime() <= Date.now();
};

const promotionUrl = (id: string) => `/api/v2/retail/promotions/${encodeURIComponent(id)}`;

const promotionNew: SheetKind = {
  title: "New promotion",
  sub: "Products › Promotions",
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "name", t: "text", l: "Name", max: 120, needed: "Name is needed." },
        { id: "kind", t: "seg", l: "Kind", o: KIND_SEG.map(([label]) => label), v: KIND_SEG[0]![0] },
        ...valueFields,
      ],
    },
    { title: "What it applies to", fields: appliesFields },
    {
      title: "When and who",
      fields: [
        { id: "starts", t: "datetime", l: "Starts", half: true, v: () => pickerValue(tomorrowStart()), earliest: "today", needed: "Choose when it starts." },
        endsField,
        { id: "audience", t: "seg", l: "Who", o: AUDIENCE_SEG.map(([label]) => label), v: AUDIENCE_SEG[0]![0] },
        { id: "stacks", t: "toggle", l: "Works with other promotions", v: false },
        {
          id: "code",
          t: "text",
          l: "Code",
          half: true,
          mono: true,
          upper: true,
          max: 30,
          derive: (values) => codeFromName(String(values.name ?? "")),
          h: "Shows on receipts and in Insights.",
          needed: "Give it a code.",
        },
      ],
    },
  ],
  note: "It runs on its own between the dates. Judge it on its record.",
  primary: (values) => (startsNow(values) ? "Start it" : "Schedule it"),
  done: (_result, _values, payload) => String((payload as { message?: string } | null)?.message ?? "The promotion is saved."),
  open: (result) => `/retail/products/promotions/${(result as PromotionView).id}`,
  // Duplicate from a record: its rules, as "<name> (copy)", from tomorrow.
  load: async (ctx) => {
    const from = ctx.params.get("from");
    if (!from) return {};
    const view = await readJson<PromotionView>(promotionUrl(from));
    return {
      name: `${view.name} (copy)`,
      kind: KIND_SEG.find(([, kind]) => kind === view.kind)![0],
      ...valueFieldsOf(view),
      appliesTo: SCOPE_SEG.find(([, scope]) => scope === view.scope)![0],
      products: view.scope === "PRODUCTS" ? view.products.map((product) => ({ id: product.id, label: product.name })) : [],
      categories: view.categories.map((category) => ({ id: category.id, label: category.name })),
      audience: AUDIENCE_SEG.find(([, audience]) => audience === view.audience)![0],
      stacks: view.stacks,
      _unitWord: view.unitWord,
    };
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/promotions",
    body: {
      name: String(values.name ?? "").trim(),
      kind: kindOf(values),
      value: valueOfFields(values),
      ...(kindOf(values) === "BUY_X_PAY" ? { buyQuantity: Number(String(values.buy ?? "").trim()) } : {}),
      ...appliesBody(values),
      starts: String(values.starts ?? ""),
      ends: typeof values.ends === "string" && values.ends ? values.ends : null,
      audience: AUDIENCE_SEG.find(([label]) => label === values.audience)?.[1] ?? "EVERYONE",
      stacks: values.stacks === true,
      code: String(values.code ?? "").trim() || null,
    },
  }),
  invalidate: invalidatePromotions,
  requires: [["retail.promotions", "create"]],
};

const started = (values: SheetValues) => values._started === true;

const promotionEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? "A promotion"),
  sub: (_ctx, values) =>
    values._name === undefined
      ? "Products › Promotions"
      : `${String(values._code)} · ${String(values._stateWord)} · ${formatCount(Number(values._sold ?? 0))} sold`,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "name", t: "text", l: "Name", max: 120, needed: "Name is needed." },
        { id: "kind", t: "seg", l: "Kind", o: KIND_SEG.map(([label]) => label), disabled: started },
        ...valueFields,
      ],
    },
    { title: "What it applies to", fields: appliesFields },
    {
      title: "When",
      fields: [
        { id: "startedAt", t: "read", l: "Started", half: true, show: started },
        { id: "starts", t: "datetime", l: "Starts", half: true, earliest: "today", show: (values) => !started(values), needed: "Choose when it starts." },
        endsField,
      ],
    },
  ],
  note: "Changes apply to sales from now on.",
  primary: "Save",
  done: (_result, _values, payload) => String((payload as { message?: string } | null)?.message ?? "Promotion saved."),
  danger: {
    label: "End now",
    show: (_ctx, values) => values._name !== undefined && values._ended !== true,
    ask: (_ctx, values) => promotionEndAsk(String(values._code ?? "it")),
    request: (ctx) => ({ method: "POST", url: "/api/v2/retail/promotions/end", body: { ids: [ctx.id ?? ""] } }),
    done: (values) => `${String(values._name)} has ended.`,
  },
  load: async (ctx: SheetCtx) => {
    const view = await readJson<PromotionView>(promotionUrl(ctx.id ?? ""));
    const isStarted = view.state !== "SCHEDULED";
    return {
      name: view.name,
      kind: KIND_SEG.find(([, kind]) => kind === view.kind)![0],
      ...valueFieldsOf(view),
      appliesTo: SCOPE_SEG.find(([, scope]) => scope === view.scope)![0],
      products: view.scope === "PRODUCTS" ? view.products.map((product) => ({ id: product.id, label: product.name })) : [],
      categories: view.categories.map((category) => ({ id: category.id, label: category.name })),
      starts: pickerValue(new Date(view.startsAt)),
      startedAt: momentWords(new Date(view.startsAt)),
      ends: view.endsAt ? pickerValue(new Date(view.endsAt)) : null,
      _name: view.name,
      _code: view.code,
      _kind: view.kind,
      _stateWord: STATE_WORD[view.state],
      _sold: view.figures.soldUnder,
      _started: isStarted,
      _ended: view.state === "ENDED",
      _unitWord: view.unitWord,
    };
  },
  readOnly: (_ctx, values) => values._ended === true,
  submit: (values, ctx) => ({ method: "PATCH", url: promotionUrl(ctx.id ?? ""), body: editRequest(values) }),
  invalidate: invalidatePromotions,
  requires: [["retail.promotions", "update"]],
};

/** The edit's PATCH: its kind and its Starts only while it has not started. */
function editRequest(values: SheetValues) {
  const kind = kindOf(values);
  return {
    name: String(values.name ?? "").trim(),
    ...(started(values) ? {} : { kind, starts: String(values.starts ?? "") }),
    value: valueOfFields(values),
    ...(kind === "BUY_X_PAY" ? { buyQuantity: Number(String(values.buy ?? "").trim()) } : {}),
    ...appliesBody(values),
    ends: typeof values.ends === "string" && values.ends ? values.ends : null,
  };
}

export const PROMOTION_SHEETS: Record<string, SheetKind> = {
  "promotion-new": promotionNew,
  "promotion-edit": promotionEdit,
};
