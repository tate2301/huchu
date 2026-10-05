import { z } from "zod";

import { categoryDeleteAsk, categoryMergeAsk } from "@/lib/retail/asks/categories";
import type { CategoryView } from "@/lib/retail/categories";
import { parseMargin, type CategoryVat } from "@/lib/retail/category-words";
import { formatCount } from "@/lib/workspace/format";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Products' sheets (20-products 5.26, 5.27; W-19): a new category, a
 * category (change or delete), and the Categories list's bulk sheets — Change
 * VAT, Set target margin, Merge — and its row menu's Delete category.
 */

const VAT_SEG = ["15%", "Zero-rated", "Exempt"];
const VAT_OF_SEG: Record<string, CategoryVat> = { "15%": "STANDARD", "Zero-rated": "ZERO_RATED", Exempt: "EXEMPT" };
const SEG_OF_VAT: Record<CategoryVat, string> = { STANDARD: "15%", ZERO_RATED: "Zero-rated", EXEMPT: "Exempt" };

const marginSchema = z
  .string()
  .refine((value) => parseMargin(value) !== undefined, "Write the target margin as a percentage under 100, like 30%.");

const invalidateCategories = [["list", "retail-categories"], ["lookup", "category"], ["list", "retail-products"]];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  }
  return ((payload as { data?: T })?.data ?? payload) as T;
}

const readCategory = (id: string) => readJson<CategoryView>(`/api/v2/retail/categories/${encodeURIComponent(id)}`);

/** The ticked rows: `?ids=a,b`, or `?id=` for one. */
function idsOf(ctx: SheetCtx): string[] {
  const many = ctx.params.get("ids");
  if (many) return many.split(",").filter(Boolean);
  return ctx.id ? [ctx.id] : [];
}

const countWords = (n: number) => `${formatCount(n)} ${n === 1 ? "category" : "categories"}`;
const productWords = (n: number) => `${formatCount(n)} ${n === 1 ? "product" : "products"}`;

/** What a loaded category puts in the sheet: its values, and `_` facts for the title, note and asks. */
function categoryValues(view: CategoryView): SheetValues {
  return {
    name: view.name,
    vat: SEG_OF_VAT[view.vat],
    margin: view.targetMargin === null ? "" : `${view.targetMargin}%`,
    ageCheck: view.ageCheck,
    returnable: view.returnable,
    moveTo: view.moveTo ? { id: view.moveTo.id, label: view.moveTo.label } : null,
    _name: view.name,
    _sub: view.sub,
    _products: view.products,
    _children: view.children,
    _liquor: view.shop.liquor,
    _deposits: view.shop.deposits,
    _returnable: view.returnable,
  };
}

const nameField: FieldSpec = { id: "name", t: "text", l: "Name" };
const vatField: FieldSpec = { id: "vat", t: "seg", l: "VAT", half: true, o: VAT_SEG, v: "15%" };
const marginField = (hint: boolean): FieldSpec => ({
  id: "margin",
  t: "text",
  l: "Target margin",
  half: true,
  mono: true,
  p: "30%",
  ...(hint ? { h: "Prices below it are flagged." } : {}),
  schema: marginSchema,
});
const ageField = (hint: boolean): FieldSpec => ({
  id: "ageCheck",
  t: "toggle",
  l: "Check ID, 18 and over",
  // The hint is a liquor store's; general retail sees the switch alone.
  ...(hint ? { h: (values: SheetValues) => (values._liquor ? "Liquor store: on for beer, spirits, wine and ciders." : "") } : {}),
});
const returnableField = (hint: boolean): FieldSpec => ({
  id: "returnable",
  t: "toggle",
  l: "Bottles are returnable",
  ...(hint ? { h: "New products in it get a deposit." } : {}),
  // A liquor store with empties and deposits on; a category already returnable keeps its switch.
  show: (values) => values._deposits === true || values._returnable === true,
});

const categoryBody = (values: SheetValues) => ({
  name: String(values.name ?? "").trim(),
  vat: VAT_OF_SEG[String(values.vat)] ?? "STANDARD",
  targetMargin: String(values.margin ?? "").trim(),
  ageCheck: values.ageCheck === true,
  returnable: values.returnable === true,
});

/** "Spirits deleted. Its 61 products are in Spirits and liqueurs now." */
function deletedSentence(values: SheetValues, result: unknown): string {
  const name = String(values._name ?? "The category");
  const answer = (result ?? {}) as { moved?: number; into?: string | null };
  const moved = answer.moved ?? 0;
  if (moved > 0 && answer.into) return `${name} deleted. Its ${productWords(moved)} are in ${answer.into} now.`;
  return `${name} deleted.`;
}

const moveToField: FieldSpec = {
  id: "moveTo",
  t: "auto",
  l: "If deleted, move its products to",
  noun: "category",
  context: (ctx) => ({ exclude: ctx.id }),
};

const deleteAsk = (values: SheetValues) =>
  categoryDeleteAsk({
    name: String(values._name ?? "this category"),
    products: Number(values._products ?? 0),
    into: (values.moveTo as PickedOption | null)?.label ?? null,
  });

const deleteRequest = (ctx: SheetCtx, values: SheetValues) => ({
  method: "POST" as const,
  url: `/api/v2/retail/categories/${encodeURIComponent(ctx.id ?? "")}/delete`,
  body: { moveTo: (values.moveTo as PickedOption | null)?.id ?? null },
});

/** 5.26 — `K.category`. */
const categoryNew: SheetKind = {
  title: "New category",
  sub: "Products › Categories",
  cur: "US$",
  sections: [
    {
      fields: [
        nameField,
        { id: "parent", t: "auto", l: "Inside", noun: "category", context: { topLevel: true }, opt: true, p: "Nothing, top level" },
        vatField,
        marginField(true),
        ageField(true),
        returnableField(true),
      ],
    },
  ],
  note: "Categories are yours. A liquor store starts with seven.",
  primary: "Add category",
  done: (result) => `${(result as CategoryView).name} added. It is in every category field now.`,
  load: async () => {
    const shop = await readJson<{ liquor: boolean; deposits: boolean }>("/api/v2/retail/categories/new-context");
    return { _liquor: shop.liquor, _deposits: shop.deposits };
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/categories",
    body: { ...categoryBody(values), parentId: (values.parent as PickedOption | null)?.id ?? null },
  }),
  invalidate: invalidateCategories,
  requires: [["retail.categories", "create"]],
};

/** 5.27 — `K.categoryedit`. A bookkeeper reads it; only the owner deletes. */
const categoryEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? ""),
  sub: (_ctx, values) => String(values._sub ?? "Products › Categories"),
  cur: "US$",
  sections: [
    { fields: [nameField, vatField, marginField(false), ageField(false), returnableField(false)] },
    {
      title: "Deleting",
      forDanger: true,
      show: (values, ctx) => ctx.can("retail.categories", "delete") && Number(values._products ?? 0) > 0,
      fields: [moveToField],
    },
  ],
  note: (values) => {
    const products = Number(values._products ?? 0);
    return products > 0 ? `Changes apply to all ${productWords(products)}.` : "No products are in it yet.";
  },
  primary: "Save",
  done: (result) => `${(result as CategoryView).name} saved.`,
  danger: {
    label: "Delete category",
    show: (ctx, values) => ctx.can("retail.categories", "delete") && values._name !== undefined,
    ask: (_ctx, values) => deleteAsk(values),
    request: deleteRequest,
    done: deletedSentence,
  },
  readOnly: (ctx) => !ctx.can("retail.categories", "update"),
  load: async (ctx) => categoryValues(await readCategory(ctx.id ?? "")),
  submit: (values, ctx) => ({
    method: "PATCH",
    url: `/api/v2/retail/categories/${encodeURIComponent(ctx.id ?? "")}`,
    body: categoryBody(values),
  }),
  invalidate: invalidateCategories,
  requires: [["retail.categories", "view"]],
};

/** The row menu's "Delete category" (**Defined here**): where its products go, then the ask. */
const categoryDelete: SheetKind = {
  title: (_ctx, values) => (values._name ? `Delete ${String(values._name)}` : "Delete category"),
  sub: (_ctx, values) => String(values._sub ?? "Products › Categories"),
  cur: "US$",
  sections: [
    {
      show: (values) => Number(values._products ?? 0) > 0 || Number(values._children ?? 0) > 0,
      fields: [moveToField],
    },
  ],
  note: "It stays in the bin for 30 days.",
  primary: "Delete category",
  confirm: (values) => deleteAsk(values),
  done: (result, values) => deletedSentence(values, result),
  load: async (ctx) => categoryValues(await readCategory(ctx.id ?? "")),
  submit: (values, ctx) => deleteRequest(ctx, values),
  invalidate: invalidateCategories,
  requires: [["retail.categories", "delete"]],
};

/** Bulk "Change VAT" (**Defined here**): one field. */
const categoryVat: SheetKind = {
  title: "Change VAT",
  sub: (ctx) => countWords(idsOf(ctx).length),
  cur: "US$",
  sections: [{ fields: [{ ...vatField, half: false, v: undefined }] }],
  note: "Every product in them takes the new VAT on every till.",
  primary: "Change VAT",
  done: (result) => {
    const answer = result as { changed: number; products: number };
    return `VAT changed on ${countWords(answer.changed)} and ${productWords(answer.products)}.`;
  },
  submit: (values, ctx) => ({
    method: "POST",
    url: "/api/v2/retail/categories/vat",
    body: { ids: idsOf(ctx), vat: VAT_OF_SEG[String(values.vat)] },
  }),
  invalidate: invalidateCategories,
  requires: [["retail.categories", "update"]],
};

/** Bulk "Set target margin" (**Defined here**): one field. */
const categoryMargin: SheetKind = {
  title: "Set target margin",
  sub: (ctx) => countWords(idsOf(ctx).length),
  cur: "US$",
  sections: [{ fields: [{ ...marginField(true), half: false }] }],
  note: "Prices below it are flagged on the price lists.",
  primary: "Set target margin",
  done: (result) => `Target margin set on ${countWords((result as { changed: number }).changed)}.`,
  submit: (values, ctx) => ({
    method: "POST",
    url: "/api/v2/retail/categories/target-margin",
    body: { ids: idsOf(ctx), targetMargin: String(values.margin ?? "").trim() },
  }),
  invalidate: invalidateCategories,
  requires: [["retail.categories", "update"]],
};

/** Bulk "Merge" (**Defined here**): "Into", then the `categorymerge` ask. Owner only. */
const categoryMerge: SheetKind = {
  title: "Merge categories",
  sub: (ctx) => countWords(idsOf(ctx).length),
  cur: "US$",
  sections: [{ fields: [{ id: "into", t: "auto", l: "Into", noun: "category" }] }],
  note: "Their products move into it and take its VAT and age check.",
  primary: "Merge",
  confirm: (values, ctx) => {
    const into = values.into as PickedOption;
    const counts = (values._products ?? {}) as Record<string, number>;
    const others = idsOf(ctx).filter((id) => id !== into.id);
    return categoryMergeAsk({
      count: others.length,
      into: into.label,
      products: others.reduce((sum, id) => sum + (counts[id] ?? 0), 0),
    });
  },
  done: (result, values) => {
    const answer = result as { merged: number; moved: number };
    const into = (values.into as PickedOption | null)?.label ?? "one";
    return `${countWords(answer.merged)} merged into ${into}. ${productWords(answer.moved)} moved.`;
  },
  load: async (ctx) => {
    const views = await Promise.all(idsOf(ctx).map((id) => readCategory(id)));
    return { _products: Object.fromEntries(views.map((view) => [view.id, view.products])) };
  },
  submit: (values, ctx) => ({
    method: "POST",
    url: "/api/v2/retail/categories/merge",
    body: { ids: idsOf(ctx), into: (values.into as PickedOption).id },
  }),
  invalidate: invalidateCategories,
  requires: [["retail.categories", "delete"]],
};

export const PRODUCT_SHEETS: Record<string, SheetKind> = {
  "category-new": categoryNew,
  "category-edit": categoryEdit,
  "category-delete": categoryDelete,
  "category-vat": categoryVat,
  "category-margin": categoryMargin,
  "category-merge": categoryMerge,
};
