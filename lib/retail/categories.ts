import { Prisma, type RetailBusinessType } from "@prisma/client";
import { z } from "zod";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import {
  categoryPath,
  categorySubline,
  nearestByName,
  parseMargin,
  STANDARD_VAT_RATE,
  vatLabelOf,
  vatOf,
  CATEGORY_VATS,
  type CategoryVat,
} from "@/lib/retail/category-words";

export {
  CATEGORY_VATS,
  categoryPath,
  categorySubline,
  nearestByName,
  parseMargin,
  vatLabelOf,
  vatOf,
  type CategoryVat,
} from "@/lib/retail/category-words";

/**
 * A shop's product categories (20-products W-19, 4.11).
 *
 * The shop's own list, in Products › Categories. A new shop starts with the
 * categories its business type implies; from then on the list is the owner's,
 * and every product field that asks for a category reads it from here.
 *
 * A category carries what its products are taxed and checked by — VAT (15%,
 * Zero-rated or Exempt), the 18+ check, whether its bottles are returnable —
 * and the margin its prices are measured against. A category may sit inside
 * one other, one level deep ("Spirits · Liqueur").
 *
 * VAT is copied onto each product (`Product.defaultTaxRate`, what the till
 * snapshot reads), so changing a category's VAT rewrites its products in the
 * same transaction. The age check and returnable are read through the category
 * at sale time and need no rewrite.
 *
 * Deleting moves the products (and any categories inside it) to another
 * category first, then puts it in the bin; a restore brings it back empty.
 */

type Seed = {
  name: string;
  vatRate: number;
  ageRestricted?: boolean;
  returnable?: boolean;
  depositAmount?: number;
  targetMarginPercent?: number;
};

/**
 * What each business type starts with.
 *
 * VAT is the standard 15% throughout: zero-rating basic foods is the owner's
 * call, category by category, and guessing it here would put wrong tax on
 * receipts.
 */
export const CATEGORY_SEEDS: Record<RetailBusinessType, Seed[]> = {
  GENERAL: [
    { name: "Groceries", vatRate: 15, targetMarginPercent: 18 },
    { name: "Drinks", vatRate: 15, targetMarginPercent: 22 },
    { name: "Snacks", vatRate: 15, targetMarginPercent: 30 },
    { name: "Household", vatRate: 15, targetMarginPercent: 25 },
    { name: "Personal care", vatRate: 15, targetMarginPercent: 28 },
    { name: "Other", vatRate: 15 },
  ],
  LIQUOR: [
    { name: "Beer", vatRate: 15, ageRestricted: true, targetMarginPercent: 22 },
    { name: "Spirits", vatRate: 15, ageRestricted: true, targetMarginPercent: 25 },
    { name: "Wine", vatRate: 15, ageRestricted: true, targetMarginPercent: 30 },
    { name: "Ciders and coolers", vatRate: 15, ageRestricted: true, targetMarginPercent: 25 },
    { name: "Soft drinks", vatRate: 15, targetMarginPercent: 28 },
    { name: "Snacks", vatRate: 15, targetMarginPercent: 30 },
    { name: "Ice and mixers", vatRate: 15, targetMarginPercent: 30 },
  ],
};

type CategoryClient = Pick<Prisma.TransactionClient, "retailCategory">;

/**
 * Add the business type's categories the shop does not have yet, stamped with
 * the type that seeded them.
 *
 * Additive and idempotent: it never renames, re-rates or removes, so an owner's
 * edits survive the business type being saved again — and a seed category the
 * owner deleted stays deleted. Returns the names added.
 */
export async function ensureRetailCategories(
  client: CategoryClient,
  companyId: string,
  businessType: RetailBusinessType,
): Promise<string[]> {
  const seeds = CATEGORY_SEEDS[businessType];
  const existing = await client.retailCategory.findMany({
    where: { companyId, name: { in: seeds.map((seed) => seed.name) } },
    select: { name: true },
  });
  const have = new Set(existing.map((row) => row.name));
  const missing = seeds.filter((seed) => !have.has(seed.name));
  if (missing.length === 0) return [];

  const highest = await client.retailCategory.aggregate({
    where: { companyId },
    _max: { sortOrder: true },
  });
  const start = (highest._max.sortOrder ?? -1) + 1;

  await client.retailCategory.createMany({
    data: missing.map((seed, index) => ({
      companyId,
      name: seed.name,
      vatRate: money(seed.vatRate),
      ageRestricted: seed.ageRestricted ?? false,
      returnable: seed.returnable ?? false,
      depositAmount: seed.depositAmount === undefined ? null : money(seed.depositAmount),
      targetMarginPercent: seed.targetMarginPercent === undefined ? null : money(seed.targetMarginPercent),
      seededFor: businessType,
      sortOrder: start + index,
    })),
    skipDuplicates: true,
  });
  return missing.map((seed) => seed.name);
}

/**
 * A shop that has never chosen a business type has no categories yet; the
 * first read seeds the general set rather than handing every product field
 * an empty list.
 */
export async function seedCategoriesIfNone(companyId: string): Promise<void> {
  const count = await prisma.retailCategory.count({ where: { companyId } });
  if (count > 0) return;
  const profile = await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { businessType: true } });
  await ensureRetailCategories(prisma, companyId, profile?.businessType ?? "GENERAL");
}

/* ── VAT ──────────────────────────────────────────────────────────────────── */

/** What a VAT choice writes. */
export function vatWrite(vat: CategoryVat): { vatRate: Prisma.Decimal; vatExempt: boolean } {
  if (vat === "STANDARD") return { vatRate: money(STANDARD_VAT_RATE), vatExempt: false };
  return { vatRate: money(0), vatExempt: vat === "EXEMPT" };
}

/* ── The view ─────────────────────────────────────────────────────────────── */

export type CategoryView = {
  id: string;
  name: string;
  /** "Spirits · Liqueur". */
  path: string;
  parent: { id: string; name: string } | null;
  vat: CategoryVat;
  vatLabel: string;
  /** "25", or null for none. */
  targetMargin: string | null;
  ageCheck: boolean;
  returnable: boolean;
  /** Products filed under it, not in the bin. */
  products: number;
  /** Every product filed under it, binned ones too: what a delete moves. */
  filed: number;
  /** Categories inside it. */
  children: number;
  sub: string;
  /** Where "If deleted, move its products to" starts: the alphabetically nearest other category. */
  moveTo: { id: string; label: string } | null;
  archived: boolean;
  /** What the sheet shows for this shop: the liquor hints, the returnable switch. */
  shop: CategoryShop;
};

/** A liquor store gets the 18+ hint; one with empties and deposits on gets "Bottles are returnable". */
export type CategoryShop = { liquor: boolean; deposits: boolean };

export async function categoryShop(companyId: string, db: Db = prisma): Promise<CategoryShop> {
  const profile = await db.retailShopProfile.findUnique({
    where: { companyId },
    select: { businessType: true, emptiesAndDeposits: true },
  });
  const liquor = profile?.businessType === "LIQUOR";
  return { liquor, deposits: liquor && Boolean(profile?.emptiesAndDeposits) };
}

const viewSelect = {
  id: true,
  name: true,
  vatRate: true,
  vatExempt: true,
  ageRestricted: true,
  returnable: true,
  targetMarginPercent: true,
  archivedAt: true,
  parentId: true,
  parent: { select: { id: true, name: true } },
  _count: {
    select: {
      products: { where: { archivedAt: null } },
      children: { where: { archivedAt: null } },
    },
  },
} satisfies Prisma.RetailCategorySelect;

type ViewRecord = Prisma.RetailCategoryGetPayload<{ select: typeof viewSelect }>;

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** "25.00" → "25", "22.50" → "22.5". */
function percentText(value: Prisma.Decimal | null): string | null {
  return value === null ? null : Number(value).toString();
}

/** The live categories a category's products could move to: not itself, not inside it. */
async function moveTargets(db: Db, companyId: string, id: string) {
  const rows = await db.retailCategory.findMany({
    where: { companyId, archivedAt: null, id: { not: id }, OR: [{ parentId: null }, { parentId: { not: id } }] },
    select: { id: true, name: true, parent: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, label: categoryPath(row) }));
}

async function toView(db: Db, companyId: string, record: ViewRecord): Promise<CategoryView> {
  const products = record._count.products;
  const ageCheck = record.ageRestricted;
  const [targets, shop, filed] = await Promise.all([
    moveTargets(db, companyId, record.id),
    categoryShop(companyId, db),
    db.product.count({ where: { companyId, categoryId: record.id } }),
  ]);
  return {
    id: record.id,
    name: record.name,
    path: categoryPath(record),
    parent: record.parent,
    vat: vatOf(record),
    vatLabel: vatLabelOf(record),
    targetMargin: percentText(record.targetMarginPercent),
    ageCheck,
    returnable: record.returnable,
    products,
    filed,
    children: record._count.children,
    sub: categorySubline({ products, vatRate: record.vatRate, vatExempt: record.vatExempt, ageCheck }),
    moveTo: nearestByName(record.name, targets),
    archived: record.archivedAt !== null,
    shop,
  };
}

/** One category, as the edit sheet reads it. Null when it is not this company's. */
export async function getCategory(companyId: string, id: string, db: Db = prisma): Promise<CategoryView | null> {
  const record = await db.retailCategory.findFirst({ where: { id, companyId }, select: viewSelect });
  return record ? toView(db, companyId, record) : null;
}

/** The shop's live categories, children with their parent's name in front, for every category field. */
export async function liveCategories(companyId: string) {
  await seedCategoriesIfNone(companyId);
  const rows = await prisma.retailCategory.findMany({
    where: { companyId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      vatRate: true,
      vatExempt: true,
      ageRestricted: true,
      parentId: true,
      parent: { select: { name: true } },
    },
  });
  return rows.map((row) => ({ ...row, path: categoryPath(row) }));
}

/* ── Input ────────────────────────────────────────────────────────────────── */

const MARGIN_MESSAGE = "Write the target margin as a percentage under 100, like 30%.";

const targetMargin = z
  .string()
  .max(10, MARGIN_MESSAGE)
  .nullable()
  .optional()
  .refine((value) => value === undefined || parseMargin(value) !== undefined, MARGIN_MESSAGE);

const categoryFields = z.object({
  name: z.string().trim().min(1, "Name is needed.").max(80, "Keep the name to 80 characters."),
  parentId: z.string().uuid("That category is not one of this shop's.").nullable().optional(),
  vat: z.enum(CATEGORY_VATS, { message: "Choose 15%, Zero-rated or Exempt." }),
  targetMargin,
  ageCheck: z.boolean(),
  returnable: z.boolean(),
});

/** A new category: the age check and returnable start off when not sent. */
export const categoryInput = categoryFields.extend({
  ageCheck: categoryFields.shape.ageCheck.default(false),
  returnable: categoryFields.shape.returnable.default(false),
});

/**
 * A change: only what is sent. Built from the fields without defaults — a
 * default inside `.partial()` still applies, and would switch the 18+ check
 * off on any PATCH that left it out.
 */
export const categoryPatch = categoryFields.partial();

export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryPatch = z.infer<typeof categoryPatch>;

const idsInput = z
  .array(z.string().uuid("That is not one of this shop's categories."))
  .min(1, "Tick at least one category.")
  .max(200, "Tick 200 or fewer categories.");

export const vatManyInput = z.object({ ids: idsInput, vat: categoryInput.shape.vat });
export const marginManyInput = z.object({ ids: idsInput, targetMargin });
export const mergeInput = z.object({
  ids: idsInput,
  into: z.string({ message: "Choose the category to merge into." }).uuid("Choose the category to merge into."),
});
export const deleteInput = z.object({ moveTo: z.string().uuid("Choose a category from the list.").nullable().optional() });

/** A zod failure as one sentence per field, the way the sheet shows them. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** A refusal with its status, its sentence and the field it belongs under. */
export class CategoryRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
  }
}

const NOT_FOUND = "That category is not one of this shop's.";

/* ── Rules shared by every write ──────────────────────────────────────────── */

async function lockCompanyCategories(tx: Tx, companyId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-categories:${companyId}`}))::text`;
}

/** The name is free among live categories; one in the bin does not hold it. */
async function checkName(tx: Tx, companyId: string, name: string, self: string | null) {
  const clash = await tx.retailCategory.findFirst({
    where: {
      companyId,
      archivedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(self ? { id: { not: self } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new CategoryRefusal(409, `There is already a category called ${clash.name}.`, "name");
}

/** "Inside": a live top-level category of this shop, never itself, and only for a category with none inside it. */
async function checkParent(tx: Tx, companyId: string, parentId: string, self: { id: string; name: string } | null) {
  if (self && parentId === self.id) {
    throw new CategoryRefusal(400, `${self.name} cannot go inside itself.`, "parentId");
  }
  const parent = await tx.retailCategory.findFirst({
    where: { id: parentId, companyId, archivedAt: null },
    select: { name: true, parent: { select: { name: true } } },
  });
  if (!parent) throw new CategoryRefusal(400, NOT_FOUND, "parentId");
  if (parent.parent) {
    throw new CategoryRefusal(
      400,
      `${parent.name} is already inside ${parent.parent.name}. Choose a top-level category.`,
      "parentId",
    );
  }
  if (self) {
    const inside = await tx.retailCategory.count({ where: { parentId: self.id, archivedAt: null } });
    if (inside > 0) {
      throw new CategoryRefusal(400, `${self.name} has categories inside it, so it stays top level.`, "parentId");
    }
  }
}

/** Every product filed under these categories takes this VAT. Returns how many. */
async function rewriteProductVat(tx: Tx, companyId: string, categoryIds: string[], vatRate: Prisma.Decimal) {
  const result = await tx.product.updateMany({
    where: { companyId, categoryId: { in: categoryIds } },
    data: { defaultTaxRate: vatRate },
  });
  return result.count;
}

type Change = { field: string; label: string; from: string | null; to: string | null };

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const marginWords = (value: number | null | string) => (value === null ? null : `${Number(value)}%`);

/* ── Create ───────────────────────────────────────────────────────────────── */

export async function createCategory(actor: RetailAuditActor, input: CategoryInput): Promise<CategoryView> {
  const margin = parseMargin(input.targetMargin) ?? null;
  return prisma.$transaction(async (tx) => {
    await lockCompanyCategories(tx, actor.companyId);
    await checkName(tx, actor.companyId, input.name, null);
    if (input.parentId) await checkParent(tx, actor.companyId, input.parentId, null);
    const highest = await tx.retailCategory.aggregate({
      where: { companyId: actor.companyId },
      _max: { sortOrder: true },
    });
    const created = await tx.retailCategory.create({
      data: {
        companyId: actor.companyId,
        name: input.name,
        parentId: input.parentId ?? null,
        ...vatWrite(input.vat),
        ageRestricted: input.ageCheck,
        returnable: input.returnable,
        targetMarginPercent: margin === null ? null : money(margin),
        sortOrder: (highest._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.categoryCreated,
      entityType: "RetailCategory",
      entityId: created.id,
      payload: { name: input.name, vat: input.vat, targetMargin: marginWords(margin) },
    });
    return (await getCategory(actor.companyId, created.id, tx))!;
  });
}

/* ── Change ───────────────────────────────────────────────────────────────── */

async function liveCategory(tx: Tx, companyId: string, id: string) {
  const found = await tx.retailCategory.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      parentId: true,
      vatRate: true,
      vatExempt: true,
      ageRestricted: true,
      returnable: true,
      targetMarginPercent: true,
      archivedAt: true,
    },
  });
  if (!found) throw new CategoryRefusal(404, NOT_FOUND);
  if (found.archivedAt) throw new CategoryRefusal(409, `${found.name} is in the bin. Restore it to change it.`);
  return found;
}

type Found = Awaited<ReturnType<typeof liveCategory>>;

/** Apply a patch to one category inside a transaction. Returns what changed and how many products took a new VAT. */
async function applyPatch(
  tx: Tx,
  actor: RetailAuditActor,
  found: Found,
  patch: CategoryPatch,
): Promise<{ changes: Change[]; products: number }> {
  const data: Prisma.RetailCategoryUncheckedUpdateInput = {};
  const changes: Change[] = [];
  let products = 0;

  if (patch.name !== undefined && patch.name !== found.name) {
    await checkName(tx, actor.companyId, patch.name, found.id);
    data.name = patch.name;
    changes.push({ field: "name", label: "Name", from: found.name, to: patch.name });
  }
  if (patch.parentId !== undefined && (patch.parentId ?? null) !== found.parentId) {
    if (patch.parentId) await checkParent(tx, actor.companyId, patch.parentId, found);
    data.parentId = patch.parentId ?? null;
    const name = async (id: string | null) =>
      id ? ((await tx.retailCategory.findUnique({ where: { id }, select: { name: true } }))?.name ?? null) : null;
    changes.push({ field: "parentId", label: "Inside", from: await name(found.parentId), to: await name(patch.parentId ?? null) });
  }
  if (patch.vat !== undefined && patch.vat !== vatOf(found)) {
    const write = vatWrite(patch.vat);
    Object.assign(data, write);
    products = await rewriteProductVat(tx, actor.companyId, [found.id], write.vatRate);
    changes.push({ field: "vat", label: "VAT", from: vatLabelOf(found), to: vatLabelOf(write) });
  }
  if (patch.targetMargin !== undefined) {
    const next = parseMargin(patch.targetMargin) ?? null;
    const before = found.targetMarginPercent === null ? null : Number(found.targetMarginPercent);
    if (next !== before) {
      data.targetMarginPercent = next === null ? null : money(next);
      changes.push({ field: "targetMargin", label: "Target margin", from: marginWords(before), to: marginWords(next) });
    }
  }
  if (patch.ageCheck !== undefined && patch.ageCheck !== found.ageRestricted) {
    data.ageRestricted = patch.ageCheck;
    changes.push({ field: "ageCheck", label: "Check ID, 18 and over", from: yesNo(found.ageRestricted), to: yesNo(patch.ageCheck) });
  }
  if (patch.returnable !== undefined && patch.returnable !== found.returnable) {
    data.returnable = patch.returnable;
    if (!patch.returnable) data.depositAmount = null;
    changes.push({ field: "returnable", label: "Bottles are returnable", from: yesNo(found.returnable), to: yesNo(patch.returnable) });
  }

  if (changes.length === 0) return { changes, products };
  await tx.retailCategory.update({ where: { id: found.id }, data });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.categoryChanged,
    entityType: "RetailCategory",
    entityId: found.id,
    payload: { name: (data.name as string | undefined) ?? found.name, changes, products },
  });
  return { changes, products };
}

export async function updateCategory(
  actor: RetailAuditActor,
  id: string,
  patch: CategoryPatch,
): Promise<{ data: CategoryView; changed: string[]; products: number }> {
  return prisma.$transaction(async (tx) => {
    await lockCompanyCategories(tx, actor.companyId);
    const found = await liveCategory(tx, actor.companyId, id);
    const { changes, products } = await applyPatch(tx, actor, found, patch);
    return {
      data: (await getCategory(actor.companyId, id, tx))!,
      changed: changes.map((change) => change.field),
      products,
    };
  });
}

/** Bulk "Change VAT": `{ changed }` categories, `{ products }` re-rated. */
export async function setCategoriesVat(
  actor: RetailAuditActor,
  ids: string[],
  vat: CategoryVat,
): Promise<{ changed: number; products: number }> {
  return prisma.$transaction(async (tx) => {
    await lockCompanyCategories(tx, actor.companyId);
    const found = await Promise.all([...new Set(ids)].map((id) => liveCategory(tx, actor.companyId, id)));
    let changed = 0;
    let products = 0;
    for (const category of found) {
      const result = await applyPatch(tx, actor, category, { vat });
      if (result.changes.length) changed += 1;
      products += result.products;
    }
    return { changed, products };
  });
}

/** Bulk "Set target margin". */
export async function setCategoriesMargin(
  actor: RetailAuditActor,
  ids: string[],
  margin: string | null | undefined,
): Promise<{ changed: number }> {
  return prisma.$transaction(async (tx) => {
    await lockCompanyCategories(tx, actor.companyId);
    const found = await Promise.all([...new Set(ids)].map((id) => liveCategory(tx, actor.companyId, id)));
    let changed = 0;
    for (const category of found) {
      const result = await applyPatch(tx, actor, category, { targetMargin: margin ?? null });
      if (result.changes.length) changed += 1;
    }
    return { changed };
  });
}

/* ── Delete, with the move ────────────────────────────────────────────────── */

/**
 * Move a category's products (and the categories inside it) to `moveTo`, give
 * the products that category's VAT, and put it in the bin. Inside the caller's
 * transaction.
 */
async function deleteInto(
  tx: Tx,
  actor: RetailAuditActor,
  found: Found,
  moveTo: string | null | undefined,
  now: Date,
): Promise<{ moved: number; into: string | null }> {
  // Every product filed under it moves, binned ones too; the count is the ones
  // the list shows ("Its 61 products"), as the sheet and the ask said.
  const [filed, products, inside] = await Promise.all([
    tx.product.count({ where: { companyId: actor.companyId, categoryId: found.id } }),
    tx.product.count({ where: { companyId: actor.companyId, categoryId: found.id, archivedAt: null } }),
    tx.retailCategory.findMany({ where: { parentId: found.id, archivedAt: null }, select: { id: true } }),
  ]);
  let into: { id: string; name: string; vatRate: Prisma.Decimal } | null = null;

  if (filed > 0 || inside.length > 0) {
    if (!moveTo) {
      const what =
        products > 0
          ? `its ${products} ${products === 1 ? "product goes" : "products go"}`
          : filed > 0
            ? "its products go"
            : "the categories inside it go";
      throw new CategoryRefusal(400, `Choose where ${what}.`, "moveTo");
    }
    if (moveTo === found.id) throw new CategoryRefusal(400, "Choose another category.", "moveTo");
    const target = await tx.retailCategory.findFirst({
      where: { id: moveTo, companyId: actor.companyId, archivedAt: null },
      select: { id: true, name: true, vatRate: true, parentId: true, parent: { select: { name: true } } },
    });
    if (!target) throw new CategoryRefusal(400, NOT_FOUND, "moveTo");
    if (target.parentId === found.id) {
      throw new CategoryRefusal(400, `${target.name} is inside ${found.name}. Choose a category outside it.`, "moveTo");
    }
    if (inside.length > 0 && target.parent) {
      throw new CategoryRefusal(
        400,
        `${target.name} is already inside ${target.parent.name}. Choose a top-level category.`,
        "moveTo",
      );
    }
    into = target;
    await tx.product.updateMany({
      where: { companyId: actor.companyId, categoryId: found.id },
      data: { categoryId: target.id, defaultTaxRate: target.vatRate },
    });
    if (inside.length > 0) {
      await tx.retailCategory.updateMany({ where: { parentId: found.id }, data: { parentId: target.id } });
    }
  }

  await tx.retailCategory.update({ where: { id: found.id }, data: { archivedAt: now } });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.categoryDeleted,
    entityType: "RetailCategory",
    entityId: found.id,
    payload: { name: found.name, moved: products, into: into?.name ?? null },
  });
  return { moved: products, into: into?.name ?? null };
}

export async function deleteCategory(
  actor: RetailAuditActor,
  id: string,
  moveTo: string | null | undefined,
  now: Date = new Date(),
): Promise<{ moved: number; into: string | null }> {
  return prisma.$transaction(async (tx) => {
    await lockCompanyCategories(tx, actor.companyId);
    const found = await liveCategory(tx, actor.companyId, id);
    return deleteInto(tx, actor, found, moveTo, now);
  });
}

/** Merge = delete each of `ids` into `into`. */
export async function mergeCategories(
  actor: RetailAuditActor,
  ids: string[],
  into: string,
  now: Date = new Date(),
): Promise<{ merged: number; moved: number }> {
  return prisma.$transaction(async (tx) => {
    await lockCompanyCategories(tx, actor.companyId);
    const target = await tx.retailCategory.findFirst({
      where: { id: into, companyId: actor.companyId, archivedAt: null },
      select: { id: true },
    });
    if (!target) throw new CategoryRefusal(400, NOT_FOUND, "into");
    const others = [...new Set(ids)].filter((id) => id !== into);
    if (others.length === 0) throw new CategoryRefusal(400, "Tick the categories to merge, besides the one they go into.", "into");
    const found = await Promise.all(others.map((id) => liveCategory(tx, actor.companyId, id)));
    let moved = 0;
    for (const category of found) {
      moved += (await deleteInto(tx, actor, category, into, now)).moved;
    }
    return { merged: found.length, moved };
  });
}

/**
 * Whether the bin may take a category directly (`POST /api/v2/retail/bin`):
 * only when nothing is filed under it. Otherwise it is deleted from
 * Products › Categories, which asks where its products go.
 */
export async function categoryBinRefusal(tx: Tx, companyId: string, id: string): Promise<string | null> {
  const [products, inside] = await Promise.all([
    tx.product.count({ where: { companyId, categoryId: id } }),
    tx.retailCategory.count({ where: { parentId: id, archivedAt: null } }),
  ]);
  if (products === 0 && inside === 0) return null;
  return "Delete it from Products › Categories, which asks where its products go.";
}

/**
 * Bring a category out of the bin (`POST /api/v2/retail/bin/restore`), empty:
 * its products went elsewhere when it was deleted. Refused while a live
 * category holds its name.
 */
export async function restoreCategory(tx: Tx, companyId: string, id: string): Promise<string | null> {
  await lockCompanyCategories(tx, companyId);
  const found = await tx.retailCategory.findFirst({ where: { id, companyId }, select: { name: true } });
  if (!found) return NOT_FOUND;
  const clash = await tx.retailCategory.findFirst({
    where: { companyId, archivedAt: null, id: { not: id }, name: { equals: found.name, mode: "insensitive" } },
    select: { name: true },
  });
  if (clash) return `There is already a category called ${clash.name}. Rename it, then restore this one.`;
  await tx.retailCategory.update({ where: { id }, data: { archivedAt: null } });
  return null;
}

/**
 * A category, if it is this company's and not in the bin — the check every
 * product write makes before filing a product under one.
 */
export async function findLiveRetailCategory(companyId: string, id: string) {
  return prisma.retailCategory.findFirst({
    where: { id, companyId, archivedAt: null },
    select: { id: true, name: true, vatRate: true, ageRestricted: true, returnable: true, depositAmount: true },
  });
}
