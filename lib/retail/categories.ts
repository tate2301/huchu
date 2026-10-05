import { Prisma, type RetailBusinessType } from "@prisma/client";
import { z } from "zod";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * A shop's product categories.
 *
 * The shop's own list, in Products › Categories. A new shop starts with the
 * categories its business type implies; from then on the list is the owner's,
 * and every product field that asks for a category reads it from here. Nothing
 * in retail reads the stores module's FUEL / SPARES / CONSUMABLES, which
 * describe a mine's store room.
 *
 * A category carries the defaults a product filed under it starts from — VAT,
 * the ID check, a deposit — and a target margin prices are measured against.
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
 * call, item by item, and guessing it here would put wrong tax on receipts.
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
    { name: "Spirits", vatRate: 15, ageRestricted: true, targetMarginPercent: 22 },
    { name: "Wine", vatRate: 15, ageRestricted: true, targetMarginPercent: 25 },
    { name: "Ciders and coolers", vatRate: 15, ageRestricted: true, targetMarginPercent: 28 },
    { name: "Soft drinks", vatRate: 15, targetMarginPercent: 25 },
    { name: "Snacks", vatRate: 15, targetMarginPercent: 30 },
    { name: "Ice and mixers", vatRate: 15, targetMarginPercent: 30 },
  ],
};

type CategoryClient = Pick<Prisma.TransactionClient, "retailCategory">;

/**
 * Add the business type's categories the shop does not have yet.
 *
 * Additive and idempotent: it never renames, re-rates or removes, so an owner's
 * edits survive the business type being saved again. Returns the names added.
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
      sortOrder: start + index,
    })),
    skipDuplicates: true,
  });
  return missing.map((seed) => seed.name);
}

export type RetailCategoryRow = {
  id: string;
  name: string;
  vatRate: string;
  ageRestricted: boolean;
  returnable: boolean;
  depositAmount: string | null;
  targetMarginPercent: string | null;
  productCount: number;
  archivedAt: string | null;
};

const categorySelect = {
  id: true,
  name: true,
  vatRate: true,
  ageRestricted: true,
  returnable: true,
  depositAmount: true,
  targetMarginPercent: true,
  archivedAt: true,
  _count: { select: { products: { where: { archivedAt: null } } } },
} satisfies Prisma.RetailCategorySelect;

type CategoryRecord = Prisma.RetailCategoryGetPayload<{ select: typeof categorySelect }>;

function toRow(record: CategoryRecord): RetailCategoryRow {
  return {
    id: record.id,
    name: record.name,
    vatRate: record.vatRate.toFixed(2),
    ageRestricted: record.ageRestricted,
    returnable: record.returnable,
    depositAmount: record.depositAmount?.toFixed(2) ?? null,
    targetMarginPercent: record.targetMarginPercent?.toFixed(2) ?? null,
    productCount: record._count.products,
    archivedAt: record.archivedAt?.toISOString() ?? null,
  };
}

/**
 * The shop's categories, in its own order.
 *
 * A shop that has never chosen a business type has none yet, so the first read
 * seeds the general set rather than handing every product field an empty list.
 */
export async function listRetailCategories(
  companyId: string,
  options: { includeArchived?: boolean } = {},
): Promise<RetailCategoryRow[]> {
  const count = await prisma.retailCategory.count({ where: { companyId } });
  if (count === 0) {
    const profile = await prisma.retailShopProfile.findUnique({
      where: { companyId },
      select: { businessType: true },
    });
    await ensureRetailCategories(prisma, companyId, profile?.businessType ?? "GENERAL");
  }
  const rows = await prisma.retailCategory.findMany({
    where: { companyId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { sortOrder: "asc" }, { name: "asc" }],
    select: categorySelect,
  });
  return rows.map(toRow);
}

const percent = z.number().min(0).max(100);

export const categoryInput = z.object({
  name: z.string().trim().min(1, "Give the category a name").max(80),
  vatRate: percent.default(15),
  ageRestricted: z.boolean().default(false),
  returnable: z.boolean().default(false),
  depositAmount: z.number().min(0).max(1_000).nullable().default(null),
  targetMarginPercent: z.number().min(0).max(99.99).nullable().default(null),
});

export const categoryPatch = categoryInput.partial();

export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryPatch = z.infer<typeof categoryPatch>;

export class CategoryNameTaken extends Error {
  constructor(name: string) {
    super(`There is already a category called ${name}`);
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createRetailCategory(companyId: string, input: CategoryInput): Promise<RetailCategoryRow> {
  const highest = await prisma.retailCategory.aggregate({ where: { companyId }, _max: { sortOrder: true } });
  try {
    const record = await prisma.retailCategory.create({
      data: {
        companyId,
        name: input.name,
        vatRate: money(input.vatRate),
        ageRestricted: input.ageRestricted,
        returnable: input.returnable,
        depositAmount: input.returnable && input.depositAmount !== null ? money(input.depositAmount) : null,
        targetMarginPercent: input.targetMarginPercent === null ? null : money(input.targetMarginPercent),
        sortOrder: (highest._max.sortOrder ?? -1) + 1,
      },
      select: categorySelect,
    });
    return toRow(record);
  } catch (error) {
    if (isUniqueViolation(error)) throw new CategoryNameTaken(input.name);
    throw error;
  }
}

/**
 * Change a category. Moving it to the bin and back is the bin's
 * (`lib/retail/bin.ts`), which writes who did it. Returns null when the
 * category is not this company's.
 */
export async function updateRetailCategory(
  companyId: string,
  id: string,
  patch: CategoryPatch,
): Promise<RetailCategoryRow | null> {
  const found = await prisma.retailCategory.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!found) return null;

  const data: Prisma.RetailCategoryUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.vatRate !== undefined) data.vatRate = money(patch.vatRate);
  if (patch.ageRestricted !== undefined) data.ageRestricted = patch.ageRestricted;
  if (patch.returnable !== undefined) {
    data.returnable = patch.returnable;
    if (!patch.returnable) data.depositAmount = null;
  }
  if (patch.depositAmount !== undefined && patch.returnable !== false) {
    data.depositAmount = patch.depositAmount === null ? null : money(patch.depositAmount);
  }
  if (patch.targetMarginPercent !== undefined) {
    data.targetMarginPercent = patch.targetMarginPercent === null ? null : money(patch.targetMarginPercent);
  }

  try {
    const record = await prisma.retailCategory.update({ where: { id }, data, select: categorySelect });
    return toRow(record);
  } catch (error) {
    if (isUniqueViolation(error) && patch.name) throw new CategoryNameTaken(patch.name);
    throw error;
  }
}

/**
 * A category, if it is this company's and not archived — the check every
 * product write makes before filing a product under one.
 */
export async function findLiveRetailCategory(companyId: string, id: string) {
  return prisma.retailCategory.findFirst({
    where: { id, companyId, archivedAt: null },
    select: { id: true, name: true, vatRate: true, ageRestricted: true, returnable: true, depositAmount: true },
  });
}
