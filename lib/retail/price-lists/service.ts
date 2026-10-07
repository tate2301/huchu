import { Prisma, type PriceListAudience } from "@prisma/client";
import { z } from "zod";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { followPrice, priceChangeNeedsOwner } from "@/lib/retail/prices/change";
import { harareMoment } from "@/lib/retail/pricing/engine";

import { createdSentence, listSub, pricesRule, usedWhen, type DescribedList } from "./describe";
import { BETWEEN_HINT, HOURS_HINT, parseBetween, parseHours, type Between, type Hours } from "./hours";

/**
 * Price lists and their rules (PRD-05, 20-products 4.4, W-16): add one from
 * another list or the cost, change who and where it applies, make it the
 * default, duplicate, pause and switch on. Every price a list gets here is an
 * ADDED row in its history; a list made from another follows it
 * (`followsBase`), so a change on the base moves it too (`prices/change.ts`).
 */

type Tx = Prisma.TransactionClient;

export class PriceListRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "PriceListRefusal";
  }
}

const AUDIENCES = ["EVERYONE", "ACCOUNT_CUSTOMERS", "LOYALTY_MEMBERS", "STAFF"] as const;
const CURRENCY_WORDS: Record<string, string> = { USD: "US$", ZWG: "ZiG" };

export const priceListInput = z.object({
  name: z.string().max(200),
  startFrom: z.union([z.object({ listId: z.string().uuid() }), z.object({ cost: z.literal(true) })]),
  prices: z.enum(["SAME", "OFF", "ON"]),
  by: z.string().max(20).optional().nullable(),
  audience: z.enum(AUDIENCES),
  when: z.enum(["ALWAYS", "DAYS_AND_HOURS", "BETWEEN_DATES"]),
  hours: z.string().max(200).optional().nullable(),
  between: z.string().max(200).optional().nullable(),
  siteId: z.string().uuid().nullable(),
  categoryIds: z.array(z.string().uuid()).max(100).default([]),
  switchOn: z.boolean(),
});
export type PriceListInput = z.infer<typeof priceListInput>;

export const priceListRulesInput = z
  .object({
    name: z.string().max(200),
    isDefault: z.boolean(),
    taxInclusive: z.boolean(),
    currency: z.enum(["USD", "ZWG"]),
    audience: z.enum(AUDIENCES),
    siteId: z.string().uuid().nullable(),
  })
  .partial();
export type PriceListRulesInput = z.infer<typeof priceListRulesInput>;

export const priceListIdsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export type PriceListView = {
  id: string;
  name: string;
  state: "DRAFT" | "ON" | "PAUSED";
  isDefault: boolean;
  usedWhen: string;
  pricesRule: string;
  sub: string;
  products: number;
  belowCost: number;
  changedAt: string | null;
  taxInclusive: boolean;
  currency: "USD" | "ZWG";
  audience: PriceListAudience;
  siteId: string | null;
  siteName: string | null;
  categoryIds: string[];
  /** The smallest quantity its prices start at (Wholesale from 6). */
  minQuantity: number;
  basis: "OWN" | "LIST" | "COST";
  /** −8 is "less 8%"; null for a list of its own prices. */
  adjustPercent: number | null;
  /** The list products are priced from when they are added: its base list, else the default ("Retail"). */
  baseName: string;
};

const VIEW_SELECT = {
  id: true,
  name: true,
  isDefault: true,
  state: true,
  audience: true,
  whenKind: true,
  daysOfWeek: true,
  fromTime: true,
  toTime: true,
  startsOn: true,
  endsOn: true,
  siteId: true,
  minQuantity: true,
  basis: true,
  adjustPercent: true,
  currency: true,
  taxInclusive: true,
  updatedAt: true,
  site: { select: { name: true } },
  basisList: { select: { name: true } },
  categories: { select: { categoryId: true, category: { select: { name: true } } } },
} satisfies Prisma.PriceListSelect;

type ListRow = Prisma.PriceListGetPayload<{ select: typeof VIEW_SELECT }>;

const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export const todayInHarare = (now: Date = new Date()) => harareMoment(now).day;

function described(row: ListRow): DescribedList {
  return {
    name: row.name,
    isDefault: row.isDefault,
    state: row.state,
    audience: row.audience,
    whenKind: row.whenKind,
    daysOfWeek: row.daysOfWeek,
    fromTime: row.fromTime,
    toTime: row.toTime,
    startsOn: isoDay(row.startsOn),
    endsOn: isoDay(row.endsOn),
    minQuantity: row.minQuantity,
    basis: row.basis,
    adjustPercent: row.adjustPercent === null ? null : Number(row.adjustPercent),
  };
}

/**
 * Every live list of the company as the list page and the sheets read it:
 * its words, how many live products it prices, how many below their cost,
 * and when it last changed (itself, or a price on it).
 */
export async function loadPriceListViews(companyId: string, ids?: string[]): Promise<PriceListView[]> {
  const rows = await prisma.priceList.findMany({
    where: { companyId, archivedAt: null, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { name: "asc" },
    select: VIEW_SELECT,
  });
  if (rows.length === 0) return [];
  const listIds = rows.map((row) => row.id);
  const [counts, below, changed, fallback] = await Promise.all([
    prisma.$queryRaw<Array<{ priceListId: string; products: bigint }>>`
      SELECT pp."priceListId", COUNT(DISTINCT pp."productId") AS products
      FROM "ProductPrice" pp JOIN "Product" p ON p."id" = pp."productId"
      WHERE pp."priceListId" IN (${Prisma.join(listIds)}) AND p."archivedAt" IS NULL
      GROUP BY pp."priceListId"`,
    prisma.$queryRaw<Array<{ priceListId: string; below: bigint }>>`
      SELECT pp."priceListId", COUNT(DISTINCT pp."productId") AS below
      FROM "ProductPrice" pp JOIN "Product" p ON p."id" = pp."productId"
      WHERE pp."priceListId" IN (${Prisma.join(listIds)}) AND p."archivedAt" IS NULL
        AND p."costPrice" IS NOT NULL AND pp."unitPrice" < p."costPrice"
      GROUP BY pp."priceListId"`,
    prisma.productPriceChange.groupBy({
      by: ["priceListId"],
      where: { companyId, priceListId: { in: listIds }, appliedAt: { not: null }, product: { archivedAt: null } },
      _max: { appliedAt: true },
    }),
    prisma.priceList.findFirst({ where: { companyId, isDefault: true, archivedAt: null }, select: { name: true } }),
  ]);
  const productsOf = new Map(counts.map((row) => [row.priceListId, Number(row.products)]));
  const belowOf = new Map(below.map((row) => [row.priceListId, Number(row.below)]));
  const changedOf = new Map(changed.map((row) => [row.priceListId, row._max.appliedAt]));
  const today = todayInHarare();
  return rows.map((row) => {
    const products = productsOf.get(row.id) ?? 0;
    const last = changedOf.get(row.id);
    const changedAt = last && last > row.updatedAt ? last : row.updatedAt;
    const categories = row.categories.map((entry) => entry.category.name).sort();
    return {
      id: row.id,
      name: row.name,
      state: row.state,
      isDefault: row.isDefault,
      usedWhen: usedWhen(described(row), row.site?.name ?? null, today),
      pricesRule: pricesRule(described(row), row.basisList?.name ?? null, categories),
      sub: listSub(row, products),
      products,
      belowCost: belowOf.get(row.id) ?? 0,
      changedAt: changedAt.toISOString(),
      taxInclusive: row.taxInclusive,
      currency: row.currency === "ZWG" ? "ZWG" : "USD",
      audience: row.audience,
      siteId: row.siteId,
      siteName: row.site?.name ?? null,
      categoryIds: row.categories.map((entry) => entry.categoryId),
      minQuantity: row.minQuantity,
      basis: row.basis,
      adjustPercent: row.adjustPercent === null ? null : Number(row.adjustPercent),
      baseName: (row.basis === "LIST" ? row.basisList?.name : null) ?? fallback?.name ?? row.name,
    };
  });
}

export async function priceListView(companyId: string, id: string): Promise<PriceListView | null> {
  return (await loadPriceListViews(companyId, [id]))[0] ?? null;
}

async function nameClash(tx: Tx, companyId: string, name: string, exceptId?: string): Promise<string | null> {
  const clash = await tx.priceList.findFirst({
    where: { companyId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  return clash ? `There is already a price list called ${clash.name}.` : null;
}

function checkName(raw: string, errors: Record<string, string>): string {
  const name = raw.trim();
  if (!name) errors.name = "Name is needed.";
  else if (name.length > 80) errors.name = "Keep the name to 80 characters.";
  return name;
}

/** "10%", "10", "7.5 %" → 10, 7.5. */
function percentOf(raw: string | null | undefined): number | null {
  const match = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*$/.exec(raw ?? "");
  return match ? Number(match[1]) : null;
}

async function openSite(tx: Tx, companyId: string, siteId: string) {
  return tx.site.findFirst({ where: { id: siteId, companyId, isActive: true }, select: { id: true, name: true } });
}

type ListActor = RetailAuditActor;

/**
 * "Below cost needs the owner" (ADM-04) for a whole list: a list that tills
 * charge — switched on, or the default — may not carry a price under its
 * product's cost unless the owner puts it there. The first such row's
 * sentence, or null. A draft may hold them; switching it on asks again.
 */
export async function belowCostRefusal(
  tx: Tx,
  actor: ListActor,
  rows: Array<{ productId: string; unitPrice: Prisma.Decimal }>,
): Promise<string | null> {
  if (rows.length === 0 || canRetailRoleDo(actor.userRole, "retail.prices", "approve")) return null;
  const limits = await getApprovalLimits(actor.companyId, tx);
  if (!limits.belowCostNeedsOwner) return null;
  const costs = new Map(
    (
      await tx.product.findMany({
        where: { companyId: actor.companyId, id: { in: [...new Set(rows.map((row) => row.productId))] }, archivedAt: null, costPrice: { not: null } },
        select: { id: true, costPrice: true },
      })
    ).map((product) => [product.id, product.costPrice!]),
  );
  for (const row of rows) {
    const cost = costs.get(row.productId);
    if (!cost) continue;
    const sentence = priceChangeNeedsOwner({ priceChanges: "MANAGERS", belowCostNeedsOwner: true }, actor, { price: row.unitPrice, cost });
    if (sentence) return sentence;
  }
  return null;
}

/** The live rows of a list, lowest price under cost first, for `belowCostRefusal`. */
async function rowsBelowCost(tx: Tx, actor: ListActor, listId: string): Promise<string | null> {
  const rows = await tx.productPrice.findMany({
    where: { priceListId: listId, product: { archivedAt: null, costPrice: { not: null } } },
    select: { productId: true, unitPrice: true },
    orderBy: [{ product: { name: "asc" } }, { minQuantity: "asc" }],
  });
  return belowCostRefusal(tx, actor, rows);
}

const DEFAULT_RULE = "Only a list for everyone, always, everywhere can be the default.";

/** Two requests raced past the checks into a unique index: the name, or the one default. */
function raced(error: unknown, name: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const detail = JSON.stringify(error.meta ?? {});
    if (detail.includes("PriceList_one_default")) {
      throw new PriceListRefusal(409, "Another list just became the default. Open it again.", {
        isDefault: "Another list just became the default. Open it again.",
      });
    }
    if (detail.includes("PriceList_companyId_name_key")) {
      throw new PriceListRefusal(400, `There is already a price list called ${name}.`, { name: `There is already a price list called ${name}.` });
    }
  }
  throw error;
}

/** W-16: one list, its categories and one ADDED price per product it takes, in one transaction. */
export async function createPriceList(actor: ListActor, input: PriceListInput): Promise<{ data: PriceListView; message: string }> {
  const { companyId } = actor;
  const errors: Record<string, string> = {};
  const name = checkName(input.name, errors);

  let adjust = 0;
  if (input.prices !== "SAME") {
    const by = percentOf(input.by);
    if (by === null || by < 0 || by > 90) errors.by = "Make it 0% to 90%.";
    else adjust = input.prices === "OFF" ? -by : by;
  }

  let hours: Hours | null = null;
  let between: Between | null = null;
  const today = todayInHarare();
  if (input.when === "DAYS_AND_HOURS") {
    hours = parseHours(input.hours ?? "");
    if (!hours) errors.hours = HOURS_HINT;
  }
  if (input.when === "BETWEEN_DATES") {
    between = parseBetween(input.between ?? "", today);
    if (!between) errors.between = BETWEEN_HINT;
  }

  const created = await prisma.$transaction(async (tx) => {
    if (name && !errors.name) {
      const clash = await nameClash(tx, companyId, name);
      if (clash) errors.name = clash;
    }
    const site = input.siteId ? await openSite(tx, companyId, input.siteId) : null;
    if (input.siteId && !site) errors.siteId = "Choose one of your open sites.";
    const categoryIds = [...new Set(input.categoryIds)];
    const categories = categoryIds.length
      ? await tx.retailCategory.findMany({ where: { companyId, id: { in: categoryIds }, archivedAt: null }, select: { id: true, name: true } })
      : [];
    if (categories.length !== categoryIds.length) errors.categoryIds = "Choose your own categories.";

    const base =
      "listId" in input.startFrom
        ? await tx.priceList.findFirst({
            where: { id: input.startFrom.listId, companyId, archivedAt: null },
            select: { id: true, name: true, currency: true, taxInclusive: true },
          })
        : await tx.priceList.findFirst({
            where: { companyId, isDefault: true, archivedAt: null },
            select: { id: true, name: true, currency: true, taxInclusive: true },
          });
    if (!base) errors.startFrom = "Start from one of your price lists.";

    if (Object.keys(errors).length > 0) throw new PriceListRefusal(400, Object.values(errors)[0]!, errors);

    const fromCost = "cost" in input.startFrom;
    const now = new Date();
    const list = await tx.priceList.create({
      data: {
        companyId,
        name,
        kind: input.audience === "ACCOUNT_CUSTOMERS" ? "WHOLESALE" : "STANDARD",
        isDefault: false,
        currency: base!.currency,
        taxInclusive: base!.taxInclusive,
        state: input.switchOn ? "ON" : "DRAFT",
        audience: input.audience,
        whenKind: input.when,
        daysOfWeek: hours?.daysOfWeek ?? [],
        fromTime: hours?.fromTime ?? null,
        toTime: hours?.toTime ?? null,
        startsOn: between ? new Date(`${between.startsOn}T00:00:00Z`) : null,
        endsOn: between ? new Date(`${between.endsOn}T00:00:00Z`) : null,
        siteId: site?.id ?? null,
        minQuantity: 1,
        basis: fromCost ? "COST" : "LIST",
        basisListId: fromCost ? null : base!.id,
        adjustPercent: new Prisma.Decimal(adjust),
        updatedById: actor.userId,
      },
      select: { id: true },
    });
    if (categories.length) {
      await tx.priceListCategory.createMany({ data: categories.map((category) => ({ priceListId: list.id, categoryId: category.id })) });
    }

    const inCategories = categories.length ? { categoryId: { in: categories.map((category) => category.id) } } : {};
    const rows: Array<{ productId: string; minQuantity: Prisma.Decimal; unitPrice: Prisma.Decimal }> = fromCost
      ? (
          await tx.product.findMany({
            where: { companyId, archivedAt: null, costPrice: { not: null }, ...inCategories },
            select: { id: true, costPrice: true },
          })
        ).map((product) => ({ productId: product.id, minQuantity: new Prisma.Decimal(1), unitPrice: followPrice(product.costPrice!, adjust) }))
      : (
          await tx.productPrice.findMany({
            where: { priceListId: base!.id, product: { archivedAt: null, ...inCategories } },
            select: { productId: true, minQuantity: true, unitPrice: true },
          })
        ).map((row) => ({ productId: row.productId, minQuantity: row.minQuantity, unitPrice: followPrice(row.unitPrice, adjust) }));
    if (input.switchOn) {
      const below = await belowCostRefusal(tx, actor, rows);
      if (below) throw new PriceListRefusal(400, below, { switchOn: below });
    }
    await addRows(tx, { companyId, actor, listId: list.id, rows: rows.map((row) => ({ ...row, followsBase: true })), at: now });

    const view: DescribedList = {
      name,
      isDefault: false,
      state: input.switchOn ? "ON" : "DRAFT",
      audience: input.audience,
      whenKind: input.when,
      daysOfWeek: hours?.daysOfWeek ?? [],
      fromTime: hours?.fromTime ?? null,
      toTime: hours?.toTime ?? null,
      startsOn: between?.startsOn ?? null,
      endsOn: between?.endsOn ?? null,
      minQuantity: 1,
      basis: fromCost ? "COST" : "LIST",
      adjustPercent: adjust,
    };
    const categoryNames = categories.map((category) => category.name).sort();
    const rule = pricesRule(view, fromCost ? null : base!.name, categoryNames);
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.priceListCreated,
      entityType: "PriceList",
      entityId: list.id,
      payload: { name, products: new Set(rows.map((row) => row.productId)).size, rule },
    });
    return { id: list.id, message: createdSentence(view, fromCost ? null : base!.name, categoryNames, site?.name ?? null, today) };
  }).catch((error: unknown) => raced(error, name));

  return { data: (await priceListView(companyId, created.id))!, message: created.message };
}

/** Put rows on a list, each with its ADDED history. */
export async function addRows(
  tx: Tx,
  input: {
    companyId: string;
    actor: ListActor;
    listId: string;
    rows: Array<{ productId: string; minQuantity: Prisma.Decimal; unitPrice: Prisma.Decimal; followsBase: boolean }>;
    at: Date;
  },
) {
  if (input.rows.length === 0) return;
  await tx.productPrice.createMany({
    data: input.rows.map((row) => ({
      companyId: input.companyId,
      priceListId: input.listId,
      productId: row.productId,
      minQuantity: row.minQuantity,
      unitPrice: row.unitPrice,
      followsBase: row.followsBase,
    })),
  });
  await tx.productPriceChange.createMany({
    data: input.rows.map((row) => ({
      companyId: input.companyId,
      priceListId: input.listId,
      productId: row.productId,
      minQuantity: row.minQuantity,
      fromPrice: null,
      toPrice: row.unitPrice,
      source: "ADDED" as const,
      effectiveAt: input.at,
      appliedAt: input.at,
      createdById: input.actor.userId,
    })),
  });
}

const RULE_LABELS: Record<keyof PriceListRulesInput, string> = {
  name: "Name",
  isDefault: "Default list",
  taxInclusive: "Prices",
  currency: "Currency",
  audience: "Who gets it",
  siteId: "Where",
};

const AUDIENCE_WORDS: Record<string, string> = {
  EVERYONE: "Everyone",
  ACCOUNT_CUSTOMERS: "Customers on account",
  LOYALTY_MEMBERS: "Loyalty members",
  STAFF: "Staff",
};

/** The rules sheet: name, default, VAT, currency, who and where. */
export async function updatePriceList(
  actor: ListActor,
  id: string,
  patch: PriceListRulesInput,
): Promise<{ data: PriceListView; changed: number }> {
  const { companyId } = actor;
  const changed = await prisma.$transaction(async (tx) => {
    const list = await tx.priceList.findFirst({
      where: { id, companyId, archivedAt: null },
      select: {
        id: true,
        name: true,
        isDefault: true,
        taxInclusive: true,
        currency: true,
        audience: true,
        siteId: true,
        state: true,
        whenKind: true,
        minQuantity: true,
        site: { select: { name: true } },
        _count: { select: { categories: true } },
      },
    });
    if (!list) throw new PriceListRefusal(404, "Price list not found");
    const errors: Record<string, string> = {};
    const data: Prisma.PriceListUncheckedUpdateInput = {};
    const changes: Array<{ field: keyof PriceListRulesInput; label: string; from: string | null; to: string | null }> = [];
    const note = (field: keyof PriceListRulesInput, from: string | null, to: string | null) =>
      changes.push({ field, label: RULE_LABELS[field], from, to });

    if (patch.name !== undefined) {
      const name = checkName(patch.name, errors);
      if (!errors.name && name !== list.name) {
        const clash = await nameClash(tx, companyId, name, id);
        if (clash) errors.name = clash;
        else {
          data.name = name;
          note("name", list.name, name);
        }
      }
    }
    if (patch.isDefault !== undefined && patch.isDefault !== list.isDefault) {
      if (!patch.isDefault) {
        errors.isDefault = "One list has to be the default. Make another the default first.";
      } else {
        const below = await rowsBelowCost(tx, actor, id);
        if (below) {
          errors.isDefault = below;
        } else {
          // The old default keeps its prices and stays on; this one takes over.
          await tx.priceList.updateMany({ where: { companyId, isDefault: true, id: { not: id } }, data: { isDefault: false, state: "ON" } });
          data.isDefault = true;
          data.state = "ON";
          note("isDefault", "No", "Yes");
        }
      }
    }
    // The engine never asks the default list's rules: it is the price for
    // everyone, always, everywhere, so it carries none.
    const rulesTouched = patch.isDefault === true || patch.audience !== undefined || patch.siteId !== undefined;
    if ((patch.isDefault ?? list.isDefault) && rulesTouched && !errors.isDefault) {
      const audience = patch.audience ?? list.audience;
      const siteId = patch.siteId !== undefined ? patch.siteId : list.siteId;
      if (audience !== "EVERYONE" || siteId !== null || list.whenKind !== "ALWAYS" || list._count.categories > 0 || list.minQuantity > 1) {
        const field = patch.isDefault && !list.isDefault ? "isDefault" : audience !== "EVERYONE" ? "audience" : "siteId";
        errors[field] = DEFAULT_RULE;
      }
    }
    if (patch.taxInclusive !== undefined && patch.taxInclusive !== list.taxInclusive) {
      data.taxInclusive = patch.taxInclusive;
      note("taxInclusive", list.taxInclusive ? "Include VAT" : "Before VAT", patch.taxInclusive ? "Include VAT" : "Before VAT");
    }
    if (patch.currency !== undefined && patch.currency !== list.currency) {
      const priced = await tx.productPrice.count({ where: { priceListId: id } });
      if (priced > 0) {
        throw new PriceListRefusal(409, `Prices on ${list.name} are in ${CURRENCY_WORDS[list.currency] ?? list.currency}. Start a new ${CURRENCY_WORDS[patch.currency]} list instead.`, {
          currency: `Prices on ${list.name} are in ${CURRENCY_WORDS[list.currency] ?? list.currency}. Start a new ${CURRENCY_WORDS[patch.currency]} list instead.`,
        });
      }
      data.currency = patch.currency;
      note("currency", CURRENCY_WORDS[list.currency] ?? list.currency, CURRENCY_WORDS[patch.currency] ?? patch.currency);
    }
    if (patch.audience !== undefined && patch.audience !== list.audience) {
      data.audience = patch.audience;
      note("audience", AUDIENCE_WORDS[list.audience]!, AUDIENCE_WORDS[patch.audience]!);
    }
    if (patch.siteId !== undefined && patch.siteId !== list.siteId) {
      const site = patch.siteId ? await openSite(tx, companyId, patch.siteId) : null;
      if (patch.siteId && !site) errors.siteId = "Choose one of your open sites.";
      else {
        data.siteId = site?.id ?? null;
        note("siteId", list.site?.name ?? "All sites", site?.name ?? "All sites");
      }
    }
    if (Object.keys(errors).length > 0) throw new PriceListRefusal(400, Object.values(errors)[0]!, errors);
    if (changes.length === 0) return 0;

    await tx.priceList.update({ where: { id }, data: { ...data, updatedById: actor.userId } });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.priceListChanged,
      entityType: "PriceList",
      entityId: id,
      payload: { name: (data.name as string | undefined) ?? list.name, changes },
    });
    for (const change of changes) {
      await auditRecordEdited(tx, { actor, entityType: "PriceList", entityId: id, field: change.field, label: change.label, from: change.from, to: change.to });
    }
    return changes.length;
  }).catch((error: unknown) => raced(error, patch.name?.trim() ?? ""));
  return { data: (await priceListView(companyId, id))!, changed };
}

/** "Happy hour (copy)", or "(copy 2)" when that is taken. */
async function copyName(tx: Tx, companyId: string, name: string): Promise<string> {
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? `${name} (copy)` : `${name} (copy ${n})`;
    if (!(await nameClash(tx, companyId, candidate))) return candidate;
  }
}

/** Bulk "Duplicate": each a draft copy with the same rules and rows, following as they did. */
export async function duplicatePriceLists(actor: ListActor, ids: string[]): Promise<Array<{ id: string; name: string }>> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const lists = await tx.priceList.findMany({
      where: { companyId, id: { in: ids }, archivedAt: null },
      orderBy: { name: "asc" },
      include: { categories: true, entries: { where: { product: { archivedAt: null } } } },
    });
    const created: Array<{ id: string; name: string }> = [];
    const now = new Date();
    for (const list of lists) {
      const name = await copyName(tx, companyId, list.name);
      const copy = await tx.priceList.create({
        data: {
          companyId,
          name,
          kind: list.kind,
          isDefault: false,
          region: list.region,
          currency: list.currency,
          taxInclusive: list.taxInclusive,
          state: "DRAFT",
          audience: list.audience,
          whenKind: list.whenKind,
          daysOfWeek: list.daysOfWeek,
          fromTime: list.fromTime,
          toTime: list.toTime,
          startsOn: list.startsOn,
          endsOn: list.endsOn,
          siteId: list.siteId,
          minQuantity: list.minQuantity,
          basis: list.basis,
          basisListId: list.basisListId,
          adjustPercent: list.adjustPercent,
          updatedById: actor.userId,
        },
        select: { id: true, name: true },
      });
      if (list.categories.length) {
        await tx.priceListCategory.createMany({ data: list.categories.map((entry) => ({ priceListId: copy.id, categoryId: entry.categoryId })) });
      }
      await addRows(tx, {
        companyId,
        actor,
        listId: copy.id,
        rows: list.entries.map((entry) => ({ productId: entry.productId, minQuantity: entry.minQuantity, unitPrice: entry.unitPrice, followsBase: entry.followsBase })),
        at: now,
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.priceListCreated,
        entityType: "PriceList",
        entityId: copy.id,
        payload: { name, products: new Set(list.entries.map((entry) => entry.productId)).size, rule: "COPY", from: list.name },
      });
      created.push(copy);
    }
    return created;
  });
}

/** Pause (tills stop charging it) or switch on. The default list is never paused. */
export async function setPriceListsState(actor: ListActor, ids: string[], to: "PAUSED" | "ON"): Promise<number> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const lists = await tx.priceList.findMany({
      where: { companyId, id: { in: ids }, archivedAt: null },
      select: { id: true, name: true, isDefault: true, state: true },
    });
    const isDefault = lists.find((list) => list.isDefault);
    if (to === "PAUSED" && isDefault) {
      throw new PriceListRefusal(409, `${isDefault.name} is the default list. Make another the default first.`);
    }
    let changed = 0;
    for (const list of lists) {
      if (list.state === to) continue;
      if (to === "ON") {
        const below = await rowsBelowCost(tx, actor, list.id);
        if (below) throw new PriceListRefusal(400, `${list.name}: ${below}`);
      }
      await tx.priceList.update({ where: { id: list.id }, data: { state: to, updatedById: actor.userId } });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: to === "PAUSED" ? RETAIL_AUDIT_EVENTS.priceListPaused : RETAIL_AUDIT_EVENTS.priceListResumed,
        entityType: "PriceList",
        entityId: list.id,
        payload: { name: list.name },
      });
      changed += 1;
    }
    return changed;
  });
}

/** A price sheet's rows: each list's products by category, price and the list's minimum quantity. */
export async function priceSheetLists(companyId: string, ids: string[]) {
  const lists = await prisma.priceList.findMany({
    where: { companyId, id: { in: ids }, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      currency: true,
      minQuantity: true,
      entries: {
        where: { product: { archivedAt: null } },
        select: {
          unitPrice: true,
          minQuantity: true,
          product: { select: { name: true, code: true, retailCategory: { select: { name: true } } } },
        },
      },
    },
  });
  return lists.map((list) => ({
    name: list.name,
    currency: list.currency,
    rows: list.entries
      .map((entry) => ({
        category: entry.product.retailCategory?.name ?? "No category",
        name: entry.product.name,
        code: entry.product.code,
        price: money(entry.unitPrice).toFixed(2),
        minQuantity: Number(entry.minQuantity),
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  }));
}
