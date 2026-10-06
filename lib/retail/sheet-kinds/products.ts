import { z } from "zod";

import { categoryDeleteAsk, categoryMergeAsk } from "@/lib/retail/asks/categories";
import { archiveAsk } from "@/lib/retail/asks/products";
import type { CategoryView } from "@/lib/retail/categories";
import { parseMargin, type CategoryVat } from "@/lib/retail/category-words";
import type { ProductNewContext } from "@/lib/retail/products/context";
import { BARCODE_MESSAGE, normalizeBarcode } from "@/lib/retail/products/input";
import type { ProductView } from "@/lib/retail/products/view";
import { formatCount } from "@/lib/workspace/format";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Products' sheets (20-products 5.2, 5.3, 5.26, 5.27; W-09, W-11, W-19): New
 * product and Edit a product; a new category, a category (change or delete),
 * and the Categories list's bulk sheets — Change VAT, Set target margin,
 * Merge — and its row menu's Delete category.
 */

const VAT_SEG = ["15%", "Zero-rated", "Exempt"];
const VAT_OF_SEG: Record<string, CategoryVat> = { "15%": "STANDARD", "Zero-rated": "ZERO_RATED", Exempt: "EXEMPT" };
const SEG_OF_VAT: Record<CategoryVat, string> = { STANDARD: "15%", ZERO_RATED: "Zero-rated", EXEMPT: "Exempt" };

// Empty means none (parseMargin("") is null), as the API reads it.
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
    _filed: view.filed,
    _children: view.children,
    _liquor: view.shop.liquor,
    _deposits: view.shop.deposits,
    _returnable: view.returnable,
  };
}

const nameField: FieldSpec = { id: "name", t: "text", l: "Name" };
const vatField: FieldSpec = { id: "vat", t: "seg", l: "VAT", half: true, o: VAT_SEG, v: "15%" };
/**
 * Target margin is optional to the API (none shows "—"). New category asks
 * for it, as the board draws; a category without one can still be changed,
 * and the bulk sheet can clear it.
 */
const marginField = (hint: boolean, opt = false): FieldSpec => ({
  id: "margin",
  t: "text",
  l: "Target margin",
  half: true,
  mono: true,
  p: "30%",
  ...(opt ? { opt: true } : {}),
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

/** Something must move first: products filed under it (binned ones too), or categories inside it. */
const somethingMoves = (values: SheetValues) => Number(values._filed ?? 0) > 0 || Number(values._children ?? 0) > 0;

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
    { fields: [nameField, vatField, marginField(false, true), ageField(false), returnableField(false)] },
    {
      title: "Deleting",
      forDanger: true,
      show: (values, ctx) => ctx.can("retail.categories", "delete") && somethingMoves(values),
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
  guide: (values) =>
    values._name !== undefined && !somethingMoves(values) ? `Nothing is filed under ${String(values._name)}, so nothing moves.` : "",
  sections: [{ show: somethingMoves, fields: [moveToField] }],
  note: "It stays in the bin for 30 days.",
  primary: "Delete category",
  primaryTone: "danger",
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
  sections: [{ fields: [{ ...marginField(true, true), half: false }] }],
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

/* ── New product, Edit a product (5.2, 5.3) ─────────────────────────────── */

const SOLD_AS_SEG = ["Single", "By weight"];
const SOLD_AS_OF_SEG: Record<string, "SINGLE" | "BY_WEIGHT"> = { Single: "SINGLE", "By weight": "BY_WEIGHT" };
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const barcodeSchema = z.string().refine((typed) => normalizeBarcode(typed) !== null, BARCODE_MESSAGE);
const countSchema = (label: string) => z.string().regex(/^\s*\d+(\.\d+)?\s*$/, `${label} is a figure, zero or more.`);

/** What new-context puts in a product sheet: the `_` facts, and At starting at the default site. */
function contextValues(context: ProductNewContext): SheetValues {
  const site = context.sites.find((row) => row.isDefault) ?? context.sites[0] ?? null;
  return {
    siteId: site ? { id: site.id, label: site.name } : null,
    _oneSite: context.oneSite,
    _sites: context.sites.length,
    _listName: context.listName,
    _liquor: context.businessType === "LIQUOR",
    _depositsOn: context.depositsOn,
    _deposit: context.defaultDeposit,
  };
}

/** A category picked: whether its bottles are returnable, as the switch starts. */
async function followCategory(value: unknown): Promise<SheetValues | null> {
  const picked = value as PickedOption | null;
  if (!picked?.id) return null;
  const view = await readCategory(picked.id);
  return { returnable: view.returnable };
}

const productFields = (edit: boolean): FieldSpec[] => [
  { id: "name", t: "text", l: "Name", p: "What the till and receipts say" },
  {
    id: "categoryId",
    t: "auto",
    l: "Category",
    noun: "category",
    p: "Search categories",
    h: "Sets VAT and the 18+ check.",
    follow: (value) => followCategory(value),
  },
  {
    id: "price",
    t: "money",
    l: "Price",
    half: true,
    h: (values) => `Goes into the ${String(values._listName ?? "Retail")} price list.`,
    ...(edit ? { disabled: (values: SheetValues) => values._canPrice === false } : {}),
  },
];

const moreFields = (edit: boolean): FieldSpec[] => {
  const fresh = (values: SheetValues) => !edit || values._hasMovements === false;
  return [
    { id: "barcode", t: "text", l: "Barcode", half: true, mono: true, p: "Scan it or type it", opt: true, optQuiet: true, schema: barcodeSchema },
    {
      id: "cost",
      t: "money",
      l: "Cost",
      half: true,
      opt: true,
      optQuiet: true,
      h: "Shows the margin. Updated by each delivery.",
      show: (_values, ctx) => ctx.can("retail.catalog", "view-cost"),
    },
    { id: "supplierId", t: "auto", l: "Supplier", noun: "supplier", p: "Search suppliers", opt: true, optQuiet: true },
    {
      id: "openingStock",
      t: "text",
      l: "Opening stock",
      half: true,
      mono: true,
      right: true,
      p: "0",
      opt: true,
      optQuiet: true,
      schema: countSchema("Opening stock"),
      show: fresh,
    },
    {
      id: "siteId",
      t: "auto",
      l: "At",
      half: true,
      noun: "site",
      opt: true,
      optQuiet: true,
      h: (values) => `Asked only because you have ${COUNT_WORDS[Number(values._sites ?? 2)] ?? String(values._sites)} sites.`,
      show: (values) => values._oneSite === false && fresh(values),
    },
    {
      id: "reorderAt",
      t: "text",
      l: "Reorder at",
      half: true,
      mono: true,
      right: true,
      p: "Leave empty to never ask",
      opt: true,
      optQuiet: true,
      schema: countSchema("Reorder at"),
    },
    {
      id: "soldAs",
      t: "seg",
      l: "Sold as",
      half: true,
      o: SOLD_AS_SEG,
      v: "Single",
      // The unit its stock is counted in: fixed once stock has moved.
      ...(edit ? { disabled: (values: SheetValues) => values._hasMovements === true } : {}),
    },
    {
      id: "returnable",
      t: "toggle",
      l: "Returnable bottle",
      h: (values) => `Charge a US$${String(values._deposit ?? "0.10")} deposit, refunded when the bottle comes back. Liquor store.`,
      show: (values) => values._liquor === true && values._depositsOn === true,
    },
  ];
};

const pickedId = (value: unknown) => (value as PickedOption | null)?.id ?? null;
const text = (value: unknown) => String(value ?? "").trim();

/** The body both sheets send: what the API's `productInput` reads. */
function productBody(values: SheetValues, ctx: SheetCtx, edit: boolean) {
  const opening = text(values.openingStock);
  const fresh = !edit || values._hasMovements === false;
  return {
    name: text(values.name),
    categoryId: pickedId(values.categoryId),
    ...(!edit || ctx.can("retail.prices", "update") ? { price: text(values.price) } : {}),
    barcode: text(values.barcode) || null,
    ...(ctx.can("retail.catalog", "view-cost") ? { cost: text(values.cost) || null } : {}),
    supplierId: pickedId(values.supplierId),
    ...(fresh && opening ? { openingStock: opening } : {}),
    ...(fresh && values._oneSite === false && pickedId(values.siteId) ? { siteId: pickedId(values.siteId) } : {}),
    reorderAt: text(values.reorderAt) || null,
    soldAs: SOLD_AS_OF_SEG[String(values.soldAs)] ?? "SINGLE",
    ...(values._liquor === true && values._depositsOn === true ? { returnable: values.returnable === true } : {}),
  };
}

const invalidateProducts = [
  ["list", "retail-products"],
  ["list", "retail-stock-on-hand"],
  ["list", "retail-prices"],
  ["lookup", "product"],
  ["nav-badges"],
  ["retail-catalog"],
  ["retail-product"],
  ["record-activity"],
];

const readNewContext = () => readJson<ProductNewContext>("/api/v2/retail/products/new-context");

/** 5.2 — `K.product`: New product, over Products or On hand. */
const productNew: SheetKind = {
  title: "New product",
  sub: (_ctx, values) => `Adds it to Products, On hand and the ${String(values._listName ?? "Retail")} price list`,
  cur: "US$",
  sections: [
    { fields: productFields(false) },
    { fold: ["More details", "Barcode, cost, supplier, opening stock, reorder"], fields: moreFields(false) },
  ],
  note: "Saved means on sale, on every till. The rest can come later.",
  secondary: "Add, then another",
  again: { keep: ["categoryId", "siteId", "soldAs"] },
  primary: "Add product",
  done: (result) => {
    const view = result as ProductView;
    return `${view.name} is on sale at US$${view.price.toFixed(2)} on every till.`;
  },
  open: (result) => `/retail/products/${(result as ProductView).id}`,
  load: async () => contextValues(await readNewContext()),
  submit: (values, ctx) => ({ method: "POST", url: "/api/v2/retail/products", body: productBody(values, ctx, false) }),
  invalidate: invalidateProducts,
  requires: [["retail.catalog", "create"]],
};

/** What a loaded product puts in the Edit sheet. */
function productValues(view: ProductView, context: ProductNewContext): SheetValues {
  return {
    ...contextValues(context),
    name: view.name,
    categoryId: view.category ? { id: view.category.id, label: view.category.path } : null,
    price: view.price.toFixed(2),
    // "6001496 00112": grouped as the board prints it; saved without the space.
    barcode: view.barcode ? `${view.barcode.slice(0, 7)} ${view.barcode.slice(7)}`.trim() : "",
    cost: view.cost === null ? "" : view.cost.toFixed(2),
    supplierId: view.supplier ? { id: view.supplier.id, label: view.supplier.name } : null,
    openingStock: "",
    reorderAt: view.stock.reorderAt === null ? "" : String(view.stock.reorderAt),
    soldAs: view.soldAsKind === "BY_WEIGHT" ? "By weight" : "Single",
    returnable: view.returnable,
    _deposit: view.depositAmount === null ? context.defaultDeposit : view.depositAmount.toFixed(2),
    _name: view.name,
    _code: view.code,
    _category: view.category?.name ?? "No category",
    _archived: !view.isActive,
    _hasMovements: view.hasMovements,
    _canPrice: view.canEdit.price,
    _onHand: view.stock.onHand > 0 ? view.stock.onHandLabel : null,
  };
}

const productUrl = (ctx: SheetCtx) => `/api/v2/retail/products/${encodeURIComponent(ctx.id ?? "")}`;

/** 5.3 — `K.productedit`: Edit a product, over its record or the Products list. */
const productEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? "Edit a product"),
  sub: (_ctx, values) =>
    values._code === undefined
      ? "Products"
      : `${String(values._code)} · ${String(values._category)} · ${values._archived ? "archived" : "on sale"}`,
  cur: "US$",
  sections: [{ fields: productFields(true) }, { title: "More details", fields: moreFields(true) }],
  note: "Changes reach the tills within a minute.",
  primary: "Save",
  done: (result) => `${(result as ProductView).name} saved.`,
  danger: {
    label: (values) => (values._archived ? "Sell it again" : "Archive"),
    show: (_ctx, values) => values._code !== undefined,
    ask: (_ctx, values) =>
      values._archived
        ? null
        : archiveAsk({ name: String(values._name ?? "this product"), onHand: (values._onHand as string | null) ?? null }),
    request: (ctx, values) => ({
      method: "POST",
      url: values._archived ? "/api/v2/retail/products/unarchive" : "/api/v2/retail/products/archive",
      body: { ids: [ctx.id] },
    }),
    done: (values) => `${String(values._name)} ${values._archived ? "is on sale again." : "is off every till."}`,
  },
  load: async (ctx) => {
    const [view, context] = await Promise.all([readJson<ProductView>(productUrl(ctx)), readNewContext()]);
    return productValues(view, context);
  },
  submit: (values, ctx) => ({ method: "PATCH", url: productUrl(ctx), body: productBody(values, ctx, true) }),
  invalidate: invalidateProducts,
  requires: [["retail.catalog", "update"]],
};

export const PRODUCT_SHEETS: Record<string, SheetKind> = {
  "product-new": productNew,
  "product-edit": productEdit,
  "category-new": categoryNew,
  "category-edit": categoryEdit,
  "category-delete": categoryDelete,
  "category-vat": categoryVat,
  "category-margin": categoryMargin,
  "category-merge": categoryMerge,
};
