import { z } from "zod";

import { categoryDeleteAsk, categoryMergeAsk } from "@/lib/retail/asks/categories";
import { archiveAsk, priceListDeleteAsk } from "@/lib/retail/asks/products";
import type { CategoryView } from "@/lib/retail/categories";
import { BETWEEN_HINT, HOURS_HINT } from "@/lib/retail/price-lists/hours";
import type { PriceListView } from "@/lib/retail/price-lists/service";
import { parseMargin, type CategoryVat } from "@/lib/retail/category-words";
import type { ProductNewContext } from "@/lib/retail/products/context";
import { AGE_CHECK_SEG, ageCheckOfSeg, segOfAgeCheck } from "@/lib/retail/products/age-check";
import { BARCODE_MESSAGE, normalizeBarcode } from "@/lib/retail/products/input";
import type { ProductView } from "@/lib/retail/products/view";
import { COPIES_MESSAGE, labelCount, labelsDoneSentence, MAX_LABELS, PRINT_HERE, SHOW_MESSAGE, TOO_MANY_MESSAGE } from "@/lib/retail/labels/words";
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

export async function readJson<T>(url: string): Promise<T> {
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
const percentSchema = z
  .string()
  .refine((typed) => {
    const bare = typed.trim().replace(/%$/, "").trim();
    return bare === "" || (/^\d+(\.\d{1,2})?$/.test(bare) && Number(bare) <= 100);
  }, "Write a percentage up to 100, like 10.");

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
    {
      id: "ageCheck",
      t: "seg",
      l: "ID check, 18 and over",
      half: true,
      o: AGE_CHECK_SEG,
      v: "As category",
      h: "As category asks only when its category does.",
    },
    {
      id: "maxDiscountPercent",
      t: "text",
      l: "Most off",
      half: true,
      mono: true,
      right: true,
      p: "No limit",
      opt: true,
      optQuiet: true,
      h: "The most any discount takes off it, a manager's too.",
      schema: percentSchema,
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
    ageCheck: ageCheckOfSeg(values.ageCheck),
    maxDiscountPercent: text(values.maxDiscountPercent).replace(/%$/, "").trim() || null,
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
    { fold: ["More details", "Barcode, cost, supplier, opening stock, reorder, ID check, most off"], fields: moreFields(false) },
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
  // Duplicate (PRD-04): `from` names the product it starts from.
  load: async (ctx) => {
    const from = ctx.params.get("from");
    if (!from) return contextValues(await readNewContext());
    const [view, context] = await Promise.all([
      readJson<ProductView>(`/api/v2/retail/products/${encodeURIComponent(from)}`),
      readNewContext(),
    ]);
    return duplicateValues(view, context);
  },
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
    ageCheck: segOfAgeCheck(view.ownAgeCheck),
    maxDiscountPercent: view.maxDiscountPercent === null ? "" : String(view.maxDiscountPercent),
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

/** What Duplicate starts New product with: the category, price, cost, supplier and how it is sold, under "<name> (copy)". */
function duplicateValues(view: ProductView, context: ProductNewContext): SheetValues {
  return {
    ...contextValues(context),
    name: `${view.name} (copy)`,
    categoryId: view.category ? { id: view.category.id, label: view.category.path } : null,
    price: view.price.toFixed(2),
    cost: view.cost === null ? "" : view.cost.toFixed(2),
    supplierId: view.supplier ? { id: view.supplier.id, label: view.supplier.name } : null,
    soldAs: view.soldAsKind === "BY_WEIGHT" ? "By weight" : "Single",
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

/* ── Price lists (PRD-05) ─────────────────────────────────────────────── */

const invalidatePriceLists = [["list", "retail-price-lists"], ["list", "retail-prices"], ["lookup", "price-list"]];

/** The site lookup's "All sites" (`context.allSites`), which sends no site. */
const ALL_SITES_ID = "all";
const ALL_SITES: PickedOption = { id: ALL_SITES_ID, label: "All sites", sub: null };

const PRICES_SEG = ["The same", "% off", "% on"];
const PRICES_OF_SEG: Record<string, "SAME" | "OFF" | "ON"> = { "The same": "SAME", "% off": "OFF", "% on": "ON" };
const AUDIENCE_SEG = ["Everyone", "Customers on account", "Loyalty members", "Staff"];
const AUDIENCE_OF_SEG: Record<string, PriceListView["audience"]> = {
  Everyone: "EVERYONE",
  "Customers on account": "ACCOUNT_CUSTOMERS",
  "Loyalty members": "LOYALTY_MEMBERS",
  Staff: "STAFF",
};
const SEG_OF_AUDIENCE = Object.fromEntries(Object.entries(AUDIENCE_OF_SEG).map(([seg, value]) => [value, seg])) as Record<string, string>;
const WHEN_SEG = ["Always", "Days and hours", "Between dates"];
const WHEN_OF_SEG: Record<string, "ALWAYS" | "DAYS_AND_HOURS" | "BETWEEN_DATES"> = {
  Always: "ALWAYS",
  "Days and hours": "DAYS_AND_HOURS",
  "Between dates": "BETWEEN_DATES",
};
const VAT_PRICES_SEG = ["Include VAT", "Before VAT"];
const CURRENCY_SEG = ["US$", "ZiG"];

const audienceField: FieldSpec = { id: "audience", t: "seg", l: "Who gets it", o: AUDIENCE_SEG, v: "Everyone" };
const whereField: FieldSpec = {
  id: "siteId",
  t: "auto",
  l: "Where",
  noun: "site",
  context: { allSites: true },
  v: ALL_SITES,
};
const siteOf = (values: SheetValues) => {
  const picked = values.siteId as PickedOption | null;
  return picked && picked.id !== ALL_SITES_ID ? picked.id : null;
};

const readPriceList = (id: string) => readJson<PriceListView>(`/api/v2/retail/price-lists/${encodeURIComponent(id)}`);

/** `K.pricelistnew` (`PriceListNew.png`, W-16): start from a list or the cost, the rules, switch it on. */
const priceListNew: SheetKind = {
  title: "New price list",
  sub: "Products › Price lists",
  cur: "US$",
  sections: [
    {
      fields: [
        nameField,
        { id: "startFrom", t: "auto", l: "Start from", noun: "price-list", context: { withCost: true } },
        { id: "prices", t: "seg", l: "Prices", o: PRICES_SEG, v: "% off", half: true },
        {
          id: "by",
          t: "text",
          l: "By",
          mono: true,
          half: true,
          v: "10%",
          show: (values) => values.prices !== "The same",
          schema: z.string().refine((value) => {
            const match = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*$/.exec(value);
            return Boolean(match) && Number(match![1]) <= 90;
          }, "Make it 0% to 90%."),
        },
      ],
    },
    {
      title: "Rules",
      fields: [
        audienceField,
        { id: "when", t: "seg", l: "When", o: WHEN_SEG, v: "Always" },
        {
          id: "hours",
          t: "text",
          l: "Days and hours",
          p: "Fridays, 17:00 to 19:00",
          needed: HOURS_HINT,
          show: (values) => values.when === "Days and hours",
        },
        {
          id: "between",
          t: "text",
          l: "Between dates",
          p: "1 December to 26 December",
          needed: BETWEEN_HINT,
          show: (values) => values.when === "Between dates",
        },
        whereField,
        {
          id: "categories",
          t: "tags",
          l: "Only these categories",
          noun: "category",
          p: "Add a category, then Enter",
          h: "Empty means everything on the list.",
          opt: true,
          optQuiet: true,
        },
      ],
    },
    {
      title: "Switching on",
      fields: [{ id: "switchOn", t: "toggle", l: "Switch it on now", h: "Tills pick it up within a minute.", v: true }],
    },
  ],
  note: "When two lists apply, the till charges the lower price.",
  primary: "Add price list",
  done: (_result, _values, payload) => String((payload as { message?: string } | null)?.message ?? "Price list added."),
  next: (result) => `/retail/products/price-lists/${(result as PriceListView).id}`,
  // "Start from" opens on the default list.
  load: async () => {
    const params = new URLSearchParams({ q: "", limit: "50", context: JSON.stringify({ withCost: true }) });
    const page = await readJson<{ options: Array<{ id: string; label: string; sub?: string | null }> }>(
      `/api/v2/retail/lookup/price-list?${params.toString()}`,
    );
    const first = page.options.find((option) => option.sub?.startsWith("Default")) ?? page.options[0];
    return first ? { startFrom: { id: first.id, label: first.label, sub: first.sub ?? null } } : {};
  },
  submit: (values) => {
    const start = values.startFrom as PickedOption | null;
    const prices = PRICES_OF_SEG[String(values.prices)] ?? "SAME";
    const when = WHEN_OF_SEG[String(values.when)] ?? "ALWAYS";
    return {
      method: "POST",
      url: "/api/v2/retail/price-lists",
      body: {
        name: String(values.name ?? ""),
        startFrom: start?.id === "cost" ? { cost: true } : { listId: start?.id ?? "" },
        prices,
        by: prices === "SAME" ? null : String(values.by ?? ""),
        audience: AUDIENCE_OF_SEG[String(values.audience)] ?? "EVERYONE",
        when,
        hours: when === "DAYS_AND_HOURS" ? String(values.hours ?? "") : null,
        between: when === "BETWEEN_DATES" ? String(values.between ?? "") : null,
        siteId: siteOf(values),
        categoryIds: (Array.isArray(values.categories) ? (values.categories as PickedOption[]) : []).map((option) => option.id),
        switchOn: values.switchOn === true,
      },
    };
  },
  invalidate: invalidatePriceLists,
  requires: [["retail.prices", "create"]],
};

/** `K.pricelistedit` (`PriceListEdit.png`): the rules of one list, and Delete this list for the owner. */
const priceListRules: SheetKind = {
  title: (_ctx, values) => String(values._name ?? "Price list"),
  sub: (_ctx, values) =>
    values._name === undefined
      ? "Products › Price lists"
      : `${values._isDefault ? "Default price list" : `${String(values._name)} price list`} · ${productWords(Number(values._products ?? 0))}`,
  cur: "US$",
  sections: [
    {
      fields: [
        nameField,
        { id: "isDefault", t: "toggle", l: "Default list", h: "Every till uses it unless another rule applies." },
        { id: "taxInclusive", t: "seg", l: "Prices", o: VAT_PRICES_SEG, half: true },
        { id: "currency", t: "seg", l: "Currency", o: CURRENCY_SEG, half: true },
      ],
    },
    { title: "Rules", fields: [audienceField, whereField] },
  ],
  note: (values) => (values._isDefault ? "The default list cannot be deleted. Make another the default first." : "Tills stop using it the moment you delete it."),
  primary: "Save",
  done: (result) => `${(result as PriceListView).name} saved.`,
  danger: {
    label: "Delete this list",
    show: (ctx, values) => ctx.can("retail.prices", "delete") && values._name !== undefined,
    disabled: (values) => values._isDefault === true,
    ask: (_ctx, values) => priceListDeleteAsk(String(values._name ?? "this list")),
    request: (ctx) => ({ method: "POST", url: "/api/v2/retail/bin", body: { kind: "price-list", id: ctx.id } }),
    done: (values) => `${String(values._name)} is in the bin. Tills stopped using it.`,
  },
  readOnly: (ctx) => !ctx.can("retail.prices", "update"),
  load: async (ctx) => {
    const view = await readPriceList(ctx.id ?? "");
    return {
      name: view.name,
      isDefault: view.isDefault,
      taxInclusive: view.taxInclusive ? "Include VAT" : "Before VAT",
      currency: view.currency === "ZWG" ? "ZiG" : "US$",
      audience: SEG_OF_AUDIENCE[view.audience] ?? "Everyone",
      siteId: view.siteId ? { id: view.siteId, label: view.siteName ?? "", sub: null } : ALL_SITES,
      _name: view.name,
      _isDefault: view.isDefault,
      _products: view.products,
    };
  },
  submit: (values, ctx) => ({
    method: "PATCH",
    url: `/api/v2/retail/price-lists/${encodeURIComponent(ctx.id ?? "")}`,
    body: {
      name: String(values.name ?? ""),
      isDefault: values.isDefault === true,
      taxInclusive: values.taxInclusive === "Include VAT",
      currency: values.currency === "ZiG" ? "ZWG" : "USD",
      audience: AUDIENCE_OF_SEG[String(values.audience)] ?? "EVERYONE",
      siteId: siteOf(values),
    },
  }),
  invalidate: invalidatePriceLists,
  requires: [["retail.prices", "view"]],
};

/**
 * Print shelf labels (PRD-06, W-20; `Labels.png`): over Products with the
 * ticked rows, or a product's record with its own. A shelf strip on the till
 * printer by default; an A4 sheet prints here.
 */
const LABEL_SIZES: Array<[label: string, sub: string]> = [
  ["Shelf strip", "38 × 21 mm, on the till printer"],
  ["Price tag", "50 × 30 mm, label printer"],
  ["A4 sheet", "24 a page, any printer"],
];
const SIZE_OF_CARD: Record<string, "STRIP" | "TAG" | "A4"> = { "Shelf strip": "STRIP", "Price tag": "TAG", "A4 sheet": "A4" };

const labelIds = (ctx: SheetCtx): string[] => (ctx.id ? [ctx.id] : (ctx.params.get("ids") ?? "").split(",").filter(Boolean));
/** A bundle's record prints its own label (PRD-08). */
const labelBundleIds = (ctx: SheetCtx): string[] => (ctx.params.get("bundleIds") ?? "").split(",").filter(Boolean);

/** Copies typed as a whole number from 1 to 50, else null. */
function labelCopies(value: unknown): number | null {
  const typed = String(value ?? "").trim();
  if (!/^\d{1,2}$/.test(typed)) return null;
  const copies = Number(typed);
  return copies >= 1 && copies <= 50 ? copies : null;
}

/** The server's two refusals, said before the print: nothing to show, or too many labels. */
function labelsRefusal(values: SheetValues): string | null {
  if (values.price !== true && values.barcode !== true) return SHOW_MESSAGE;
  const copies = labelCopies(values.copies);
  if (copies !== null && copies * Number(values._products ?? 0) > MAX_LABELS) return TOO_MANY_MESSAGE;
  return null;
}

const labels: SheetKind = {
  title: "Print shelf labels",
  sub: (ctx) => {
    const bundles = labelBundleIds(ctx).length;
    if (bundles && !labelIds(ctx).length) return bundles === 1 ? "1 bundle" : `${formatCount(bundles)} bundles`;
    const count = labelIds(ctx).length + bundles;
    return count === 1 ? "1 product" : `${formatCount(count)} products ticked`;
  },
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "size",
          t: "cards",
          l: "Label size",
          nolabel: true,
          cols: 3,
          o: LABEL_SIZES,
          v: LABEL_SIZES[0]![0],
          // An A4 sheet goes to this computer's printer.
          follow: async (value) => (value === "A4 sheet" ? { printer: PRINT_HERE } : null),
        },
        { id: "price", t: "toggle", l: "Price", v: true },
        { id: "was", t: "toggle", l: "Was price, when it dropped", v: true },
        { id: "barcode", t: "toggle", l: "Barcode", v: true },
        {
          id: "copies",
          t: "text",
          l: "Copies of each",
          half: true,
          mono: true,
          right: true,
          max: 2,
          v: "1",
          needed: COPIES_MESSAGE,
          schema: z.string().refine((value) => labelCopies(value) !== null, COPIES_MESSAGE),
        },
        { id: "printer", t: "auto", l: "Printer", half: true, noun: "printer", needed: "Pick a printer." },
      ],
    },
  ],
  // The printer it starts on: the first paired till printer at the person's site, else Print here.
  load: async (ctx) => {
    const page = await readJson<{ options: PickedOption[] }>(
      `/api/v2/retail/lookup/printer?context=${encodeURIComponent(JSON.stringify({ pick: "default" }))}`,
    );
    return { printer: page.options[0] ?? PRINT_HERE, _products: labelIds(ctx).length + labelBundleIds(ctx).length };
  },
  note: (values) =>
    labelsRefusal(values) ?? "Prices changing tonight print with tomorrow’s price.",
  primaryDisabled: (values) => labelsRefusal(values) !== null,
  primary: (values) => `Print ${labelCount((labelCopies(values.copies) ?? 1) * Number(values._products ?? 0))}`,
  done: (result) => labelsDoneSentence(result as { count: number; printer: string; unpriced: string[]; notFound: number }),
  newTab: {
    when: (values) => (values.printer as PickedOption | null)?.id === PRINT_HERE.id,
    href: (result) => (result as { pdfUrl?: string }).pdfUrl ?? null,
  },
  submit: (values, ctx) => ({
    method: "POST",
    url: "/api/v2/retail/labels",
    body: {
      productIds: labelIds(ctx),
      bundleIds: labelBundleIds(ctx),
      size: SIZE_OF_CARD[String(values.size)] ?? "STRIP",
      show: { price: values.price === true, was: values.was === true, barcode: values.barcode === true },
      copies: Number(String(values.copies ?? "").trim()),
      printer: (values.printer as PickedOption | null)?.id ?? "",
    },
  }),
  invalidate: [],
  // The owner and manager change the catalogue; the stock clerk adjusts stock on the shelf (C-30).
  requires: [
    ["retail.catalog", "update"],
    ["retail.adjustments", "create"],
  ],
};

export const PRODUCT_SHEETS: Record<string, SheetKind> = {
  "price-list-new": priceListNew,
  "price-list-rules": priceListRules,
  "product-new": productNew,
  "product-edit": productEdit,
  "category-new": categoryNew,
  "category-edit": categoryEdit,
  "category-delete": categoryDelete,
  "category-vat": categoryVat,
  "category-margin": categoryMargin,
  "category-merge": categoryMerge,
  labels,
};
