import { Prisma, type RetailBundleKind, type RetailOnSaleDays } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { binState, type BinState } from "@/lib/retail/bin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { centsOf, PRICE_FIGURE_MESSAGE } from "@/lib/retail/prices/figure";
import { harareMoment } from "@/lib/retail/pricing/engine";
import { BARCODE_MESSAGE, normalizeBarcode } from "@/lib/retail/products/input";
import { setProductsSelling } from "@/lib/retail/products/selling";
import { formatMoney } from "@/lib/workspace/format";

import {
  BUNDLE_KIND_WORDS,
  daysWords,
  madeOfWords,
  parseUntil,
  untilWords,
  UNTIL_MESSAGE,
  WEEKDAY_SHORT,
} from "./words";

/**
 * Bundles and buy-more deals (W-13, PRD-08, 20-products 4.7): make one,
 * change it, pause it, put it on sale again, stop it for good, duplicate it;
 * and the figures its record and the Bundles and packs list read. Packs are
 * products (`lib/retail/products/packs.ts`): the bulk Pause takes them too,
 * as archiving the case.
 */

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export class BundleRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "BundleRefusal";
  }
}

const refuse = (field: string, message: string): never => {
  throw new BundleRefusal(400, message, { [field]: message });
};

const itemInput = z.object({
  productId: z.string().uuid("Pick one of this shop's products."),
  quantity: z.coerce.number().int("How many is a whole number.").min(1, "How many is 1 or more.").max(999, "How many is at most 999.").default(1),
});

export const bundleInput = z.object({
  kind: z.enum(["FIXED_SET", "BUY_MORE"]),
  name: z.string().trim().min(1, "Name is needed.").max(120, "Keep the name to 120 characters."),
  items: z.array(itemInput).max(40, "A bundle holds at most 40 products."),
  buyQuantity: z.coerce.number().int("Any is a whole number.").optional().nullable(),
  price: z.string().max(40),
  days: z.enum(["EVERY_DAY", "WEEKENDS", "CHOOSE"]).default("EVERY_DAY"),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  until: z.string().max(60).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
});
export type BundleInput = z.infer<typeof bundleInput>;

export const bundlePatch = bundleInput
  .omit({ kind: true })
  .partial()
  .extend({
    categoryId: z.string().uuid().nullable().optional(),
    siteId: z.string().uuid().nullable().optional(),
    tillButton: z.boolean().optional(),
  });
export type BundlePatch = z.infer<typeof bundlePatch>;

export const bundleIdsInput = z.object({ ids: z.array(z.string().uuid()).min(1, "Tick at least one.").max(200) });

/* ── Prices, stock and sales ──────────────────────────────────────────── */

/** Each product's price on the default list ("On their own"). */
export async function defaultPrices(client: Client, companyId: string, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await client.productPrice.findMany({
    where: { companyId, productId: { in: productIds }, minQuantity: 1, priceList: { isDefault: true, archivedAt: null } },
    select: { productId: true, unitPrice: true },
  });
  return new Map(rows.map((row) => [row.productId, toNumberOrZero(row.unitPrice)]));
}

type StockOf = { onHand: number; reorderAt: number | null };

/** On hand per product at the site, or at every site; with the reorder level its lines keep. */
async function stockOf(companyId: string, productIds: string[], siteId: string | null): Promise<Map<string, StockOf>> {
  if (productIds.length === 0) return new Map();
  const lines = await prisma.inventoryItem.findMany({
    where: { productId: { in: productIds }, site: { companyId }, ...(siteId ? { siteId } : {}) },
    select: { productId: true, currentStock: true, minStock: true },
  });
  const out = new Map<string, StockOf>();
  for (const line of lines) {
    const entry = out.get(line.productId!) ?? { onHand: 0, reorderAt: null };
    entry.onHand += toNumberOrZero(line.currentStock);
    if (line.minStock !== null) entry.reorderAt = (entry.reorderAt ?? 0) + toNumberOrZero(line.minStock);
    out.set(line.productId!, entry);
  }
  return out;
}

const DAY = 24 * 60 * 60 * 1000;

type SaleLineRow = { bundleId: string | null; bundleRef: string | null; productId: string | null; quantity: number; lineTotal: number; costTotal: number; at: Date };

/** Lines sold under these bundles (posted sales), since a moment. */
async function bundleLines(companyId: string, bundleIds: string[], since: Date): Promise<SaleLineRow[]> {
  if (bundleIds.length === 0) return [];
  const rows = await prisma.retailSaleLine.findMany({
    where: {
      companyId,
      bundleId: { in: bundleIds },
      sale: { status: "POSTED", saleType: "SALE", postedAt: { gte: since } },
    },
    select: {
      bundleId: true,
      bundleRef: true,
      productId: true,
      quantity: true,
      lineTotal: true,
      costTotal: true,
      sale: { select: { postedAt: true, createdAt: true } },
    },
  });
  return rows.map((row) => ({
    bundleId: row.bundleId,
    bundleRef: row.bundleRef,
    productId: row.productId,
    quantity: toNumberOrZero(row.quantity),
    lineTotal: toNumberOrZero(row.lineTotal),
    costTotal: toNumberOrZero(row.costTotal),
    at: row.sale.postedAt ?? row.sale.createdAt,
  }));
}

/** How many times each was sold together (the Sales tab's rows), counted in the database. */
async function bundleSaleCounts(companyId: string, bundleIds: string[]): Promise<Map<string, number>> {
  if (bundleIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ bundleId: string; sales: number }>>`
    SELECT l."bundleId", COUNT(DISTINCT COALESCE(l."bundleRef", l."saleId"))::int AS "sales"
    FROM "RetailSaleLine" l
    JOIN "RetailSale" s ON s."id" = l."saleId"
    WHERE l."companyId" = ${companyId}
      AND l."bundleId" IN (${Prisma.join(bundleIds)})
      AND s."status" = 'POSTED'
      AND s."saleType" = 'SALE'
    GROUP BY l."bundleId"`;
  return new Map(rows.map((row) => [row.bundleId, row.sales]));
}

type Sold = { ref: string; bundles: number; at: Date; takings: number; cost: number };

/**
 * One entry per bundle sold together (`bundleRef`): how many bundles it was
 * (a fixed set rung twice is two; a buy-more group is one), when, and what
 * its lines took and cost.
 */
export function soldBundles(
  lines: SaleLineRow[],
  bundle: { kind: RetailBundleKind; items: Array<{ productId: string; quantity: number }> },
): Sold[] {
  const byRef = new Map<string, SaleLineRow[]>();
  for (const line of lines) {
    const ref = line.bundleRef ?? `${line.at.toISOString()}:${line.productId}`;
    byRef.set(ref, [...(byRef.get(ref) ?? []), line]);
  }
  const first = bundle.items[0];
  return [...byRef.entries()].map(([ref, group]) => {
    let bundles = 1;
    if (bundle.kind === "FIXED_SET" && first) {
      const held = group.filter((line) => line.productId === first.productId).reduce((sum, line) => sum + line.quantity, 0);
      bundles = Math.max(1, Math.round(held / first.quantity));
    }
    return {
      ref,
      bundles,
      at: group[0]!.at,
      takings: group.reduce((sum, line) => sum + line.lineTotal, 0),
      cost: group.reduce((sum, line) => sum + line.costTotal, 0),
    };
  });
}

/* ── Figures ──────────────────────────────────────────────────────────── */

export type BundleItemView = {
  productId: string;
  name: string;
  category: string | null;
  quantity: number;
  each: number;
  onHand: number;
  makes: number | null;
  limiting: boolean;
  low: boolean;
};

export type BundleFigures = {
  items: BundleItemView[];
  boughtApart: number;
  saves: number;
  savesPercent: number;
  canMake: number | null;
  limitingItem: string | null;
  /** "Can make" wants a look: 3 or fewer, or the item that limits it is at or under its reorder level. */
  canMakeLow: boolean;
  sold30: number;
  soldPrev30: number;
  soldMonth: number;
  /** Sales of it, as the Sales tab lists them: one per bundle or buy-more group sold together. */
  soldAll: number;
  takings30: number;
  cost30: number;
};

type BundleRow = {
  id: string;
  kind: RetailBundleKind;
  price: Prisma.Decimal;
  buyQuantity: number | null;
  siteId: string | null;
  items: Array<{ productId: string; quantity: number; product: { name: string; isActive: boolean; archivedAt: Date | null; retailCategory: { name: string } | null } }>;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function bundleFigures(companyId: string, rows: BundleRow[], now: Date = new Date()): Promise<Map<string, BundleFigures>> {
  const productIds = [...new Set(rows.flatMap((row) => row.items.map((item) => item.productId)))];
  const prices = await defaultPrices(prisma, companyId, productIds);
  // A bundle for every site makes what the shop's default site holds; one for a site, that site's.
  const shop = (await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } }))?.defaultSiteId ?? null;
  const allSites = await stockOf(companyId, productIds, shop);
  const bySite = new Map<string, Map<string, StockOf>>();
  for (const siteId of new Set(rows.map((row) => row.siteId).filter((id): id is string => Boolean(id)))) {
    bySite.set(siteId, await stockOf(companyId, productIds, siteId));
  }
  const monthStart = new Date(`${harareMoment(now).day.slice(0, 7)}-01T00:00:00+02:00`);
  // The figures look back 60 days at most (the month is inside them); the
  // Sales tab's count is a count, not every line ever sold.
  const since = new Date(Math.min(now.getTime() - 60 * DAY, monthStart.getTime()));
  const ids = rows.map((row) => row.id);
  const [lines, salesCounts] = await Promise.all([bundleLines(companyId, ids, since), bundleSaleCounts(companyId, ids)]);

  const out = new Map<string, BundleFigures>();
  for (const row of rows) {
    const stock = row.siteId ? bySite.get(row.siteId)! : allSites;
    const price = toNumberOrZero(row.price);
    const items: BundleItemView[] = row.items.map((item) => {
      const on = stock.get(item.productId) ?? { onHand: 0, reorderAt: null };
      const live = item.product.isActive && !item.product.archivedAt;
      return {
        productId: item.productId,
        name: item.product.name,
        category: item.product.retailCategory?.name ?? null,
        quantity: row.kind === "FIXED_SET" ? item.quantity : 1,
        each: prices.get(item.productId) ?? 0,
        onHand: on.onHand,
        makes: row.kind === "FIXED_SET" ? (live ? Math.max(0, Math.floor(on.onHand / item.quantity)) : 0) : null,
        limiting: false,
        low: on.reorderAt !== null && on.onHand <= on.reorderAt,
      };
    });
    let canMake: number | null = null;
    let limitingItem: string | null = null;
    if (row.kind === "FIXED_SET" && items.length > 0) {
      canMake = Math.min(...items.map((item) => item.makes ?? 0));
      // Of those that make the fewest, the one with the fewest left runs out first.
      const limiting = items.filter((item) => item.makes === canMake).sort((a, b) => a.onHand - b.onHand)[0]!;
      limiting.limiting = true;
      limitingItem = limiting.name;
    }
    const boughtApart =
      row.kind === "FIXED_SET"
        ? round2(items.reduce((sum, item) => sum + item.each * item.quantity, 0))
        : round2((row.buyQuantity ?? 0) * Math.max(0, ...items.map((item) => item.each)));
    const saves = round2(boughtApart - price);
    const sold = soldBundles(lines.filter((line) => line.bundleId === row.id), row);
    const within = (from: number, to: number) => sold.filter((entry) => entry.at.getTime() >= now.getTime() - from * DAY && entry.at.getTime() < now.getTime() - to * DAY);
    const last30 = within(30, 0);
    const limiting = items.find((item) => item.limiting);
    out.set(row.id, {
      items,
      boughtApart,
      saves,
      savesPercent: boughtApart > 0 ? Math.round((saves / boughtApart) * 1000) / 10 : 0,
      canMake,
      limitingItem,
      canMakeLow: canMake !== null && (canMake <= 3 || Boolean(limiting?.low)),
      sold30: last30.reduce((sum, entry) => sum + entry.bundles, 0),
      soldPrev30: within(60, 30).reduce((sum, entry) => sum + entry.bundles, 0),
      soldMonth: sold.filter((entry) => entry.at >= monthStart).reduce((sum, entry) => sum + entry.bundles, 0),
      soldAll: salesCounts.get(row.id) ?? 0,
      takings30: round2(last30.reduce((sum, entry) => sum + entry.takings, 0)),
      cost30: round2(last30.reduce((sum, entry) => sum + entry.cost, 0)),
    });
  }
  return out;
}

/* ── The view ─────────────────────────────────────────────────────────── */

export type BundleState = "ON_SALE" | "PAUSED" | "STOPPED";

export type BundleView = {
  id: string;
  code: string;
  kind: RetailBundleKind;
  kindLabel: string;
  name: string;
  barcode: string | null;
  category: { id: string; name: string } | null;
  price: number;
  buyQuantity: number | null;
  days: RetailOnSaleDays;
  daysOfWeek: number[];
  daysLabel: string;
  endsOn: string | null;
  untilLabel: string;
  site: { id: string; name: string } | null;
  tillButton: boolean;
  state: BundleState;
  madeOf: string;
  items: BundleItemView[];
  boughtApart: number;
  saves: number;
  savesPercent: number;
  canMake: number | null;
  limitingItem: string | null;
  canMakeLow: boolean;
  sold30: number;
  soldPrev30: number;
  soldMonth: number;
  takings30: number;
  margin: number | null;
  marginPerBundle: number | null;
  madeBy: string | null;
  madeAt: string;
  archivedAt: string | null;
  /** The bin banner's facts, while it is in the bin. */
  bin: BinState | null;
  tabCounts: { items: number; sales: number; activity: number };
};

const bundleSelect = {
  id: true,
  code: true,
  kind: true,
  name: true,
  barcode: true,
  price: true,
  buyQuantity: true,
  days: true,
  daysOfWeek: true,
  endsOn: true,
  siteId: true,
  tillButton: true,
  pausedAt: true,
  stoppedAt: true,
  archivedAt: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true, isActive: true, archivedAt: true, retailCategory: { select: { name: true } } } },
    },
  },
} satisfies Prisma.RetailBundleSelect;

export const stateOf = (row: { pausedAt: Date | null; stoppedAt: Date | null }): BundleState =>
  row.stoppedAt ? "STOPPED" : row.pausedAt ? "PAUSED" : "ON_SALE";

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export async function loadBundleViews(
  companyId: string,
  where: { ids?: string[]; includeBinned?: boolean } = {},
  role: string | null = null,
  now: Date = new Date(),
): Promise<BundleView[]> {
  const rows = await prisma.retailBundle.findMany({
    where: { companyId, ...(where.ids ? { id: { in: where.ids } } : {}), ...(where.includeBinned ? {} : { archivedAt: null }) },
    orderBy: { code: "asc" },
    select: bundleSelect,
  });
  const figures = await bundleFigures(companyId, rows, now);
  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");
  const activity = where.ids?.length === 1
    ? await prisma.platformAuditEvent.count({ where: { companyId, entityType: "RetailBundle", entityId: where.ids[0] } })
    : 0;
  return rows.map((row) => {
    const f = figures.get(row.id)!;
    const profit = f.takings30 - f.cost30;
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      kindLabel: BUNDLE_KIND_WORDS[row.kind],
      name: row.name,
      barcode: row.barcode,
      category: row.category,
      price: toNumberOrZero(row.price),
      buyQuantity: row.buyQuantity,
      days: row.days,
      daysOfWeek: row.daysOfWeek,
      daysLabel: daysWords(row.days, row.daysOfWeek),
      endsOn: day(row.endsOn),
      untilLabel: untilWords(day(row.endsOn)),
      site: row.site,
      tillButton: row.tillButton,
      state: stateOf(row),
      madeOf: madeOfWords(row.kind, row.buyQuantity, f.items),
      items: f.items,
      boughtApart: f.boughtApart,
      saves: f.saves,
      savesPercent: f.savesPercent,
      canMake: f.canMake,
      limitingItem: f.limitingItem,
      canMakeLow: f.canMakeLow,
      sold30: f.sold30,
      soldPrev30: f.soldPrev30,
      soldMonth: f.soldMonth,
      takings30: f.takings30,
      margin: seeCost && f.takings30 > 0 ? Math.round((profit / f.takings30) * 1000) / 10 : null,
      marginPerBundle: seeCost && f.sold30 > 0 ? round2(profit / f.sold30) : null,
      madeBy: row.createdBy?.name ?? null,
      madeAt: row.createdAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      bin: null,
      tabCounts: { items: f.items.length, sales: f.soldAll, activity },
    };
  });
}

export async function loadBundleView(companyId: string, id: string, role: string | null): Promise<BundleView | null> {
  const [view] = await loadBundleViews(companyId, { ids: [id], includeBinned: true }, role);
  if (!view) return null;
  return { ...view, bin: await binState(companyId, "RetailBundle", id, view.archivedAt) };
}

/** Bundles sold per week, Monday to Sunday on Harare's clock: 13 weeks, 52, or since it was made. */
export async function bundleChart(
  companyId: string,
  id: string,
  range: "3m" | "12m" | "all",
  now: Date = new Date(),
): Promise<{ weeks: Array<{ start: string; sold: number }> } | null> {
  const row = await prisma.retailBundle.findFirst({ where: { id, companyId }, select: { ...bundleSelect } });
  if (!row) return null;
  const today = harareMoment(now);
  const monday = new Date(`${today.day}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (today.weekday - 1));
  const made = new Date(`${harareMoment(row.createdAt).day}T00:00:00Z`);
  const count = range === "3m" ? 13 : range === "12m" ? 52 : Math.max(1, Math.ceil((monday.getTime() - made.getTime()) / (7 * DAY)) + 1);
  const first = new Date(monday.getTime() - (count - 1) * 7 * DAY);
  const sold = soldBundles(await bundleLines(companyId, [id], new Date(first.getTime() - 2 * 60 * 60 * 1000)), row);
  const weeks = Array.from({ length: count }, (_, index) => ({
    start: new Date(first.getTime() + index * 7 * DAY).toISOString().slice(0, 10),
    sold: 0,
  }));
  for (const entry of sold) {
    const at = new Date(`${harareMoment(entry.at).day}T00:00:00Z`);
    const index = Math.floor((at.getTime() - first.getTime()) / (7 * DAY));
    if (index >= 0 && index < weeks.length) weeks[index]!.sold += entry.bundles;
  }
  return { weeks };
}

/* ── Checking what is asked ───────────────────────────────────────────── */

type Checked = {
  name: string;
  items: Array<{ productId: string; quantity: number; name: string; categoryId: string | null }>;
  buyQuantity: number | null;
  priceCents: number;
  days: RetailOnSaleDays;
  daysOfWeek: number[];
  endsOn: Date | null;
  barcode: string | null;
};

/** The rules every bundle keeps (20-products 4.7), refused under the field they belong to. */
async function check(
  tx: Tx,
  companyId: string,
  kind: RetailBundleKind,
  input: Omit<BundleInput, "kind">,
  self: string | null,
): Promise<Checked> {
  const name = input.name.trim();
  const ids = input.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) refuse("items", "Each product goes in once. Change how many instead.");
  const products = await tx.product.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true, name: true, isActive: true, archivedAt: true, categoryId: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const item of input.items) {
    const product = byId.get(item.productId);
    if (!product) refuse("items", "Pick one of this shop's products.");
    if (!product!.isActive || product!.archivedAt) refuse("items", `${product!.name} is not on sale. Put it on sale first, or pick another.`);
  }
  const items = input.items.map((item) => ({
    productId: item.productId,
    quantity: kind === "FIXED_SET" ? item.quantity : 1,
    name: byId.get(item.productId)!.name,
    categoryId: byId.get(item.productId)!.categoryId,
  }));

  let buyQuantity: number | null = null;
  if (kind === "FIXED_SET") {
    if (items.reduce((sum, item) => sum + item.quantity, 0) < 2) refuse("items", "A bundle needs at least two items.");
  } else {
    if (items.length === 0) refuse("items", "Pick the products any of which count.");
    buyQuantity = input.buyQuantity ?? null;
    if (buyQuantity === null || buyQuantity < 2 || buyQuantity > 24) refuse("buyQuantity", "Any is 2 to 24.");
  }

  const priceCents = centsOf(input.price);
  if (priceCents === null) refuse("price", PRICE_FIGURE_MESSAGE);
  if (priceCents! <= 0) refuse("price", "Give it a price.");
  const prices = await defaultPrices(tx, companyId, ids);
  if (kind === "FIXED_SET") {
    const apart = items.reduce((sum, item) => sum + Math.round((prices.get(item.productId) ?? 0) * 100) * item.quantity, 0);
    if (priceCents! >= apart) refuse("price", `That is not a saving: bought apart they come to ${formatMoney(apart / 100)}.`);
  } else {
    const cheapest = Math.min(...items.map((item) => Math.round((prices.get(item.productId) ?? 0) * 100)));
    const apart = cheapest * buyQuantity!;
    if (priceCents! >= apart) refuse("price", `That is not a saving: ${buyQuantity} bought apart come to ${formatMoney(apart / 100)} or more.`);
  }

  const days = input.days;
  const daysOfWeek = days === "WEEKENDS" ? [6, 7] : days === "CHOOSE" ? [...new Set(input.daysOfWeek ?? [])].sort() : [];
  if (days === "CHOOSE" && daysOfWeek.length === 0) refuse("days", "Choose at least one day.");

  const until = parseUntil(input.until ?? null);
  if (until === undefined) refuse("until", UNTIL_MESSAGE);

  let barcode: string | null = null;
  if (kind === "FIXED_SET" && input.barcode?.trim()) {
    barcode = normalizeBarcode(input.barcode.trim());
    if (!barcode) refuse("barcode", BARCODE_MESSAGE);
    const [product, bundle] = await Promise.all([
      tx.product.findFirst({ where: { companyId, archivedAt: null, barcode }, select: { name: true } }),
      tx.retailBundle.findFirst({ where: { companyId, archivedAt: null, barcode, ...(self ? { id: { not: self } } : {}) }, select: { name: true } }),
    ]);
    const taken = product?.name ?? bundle?.name;
    if (taken) refuse("barcode", `${taken} already has this barcode.`);
  }

  return { name, items, buyQuantity, priceCents: priceCents!, days, daysOfWeek, endsOn: until ? new Date(`${until}T00:00:00Z`) : null, barcode };
}

/* ── Writes ───────────────────────────────────────────────────────────── */

const money2 = (cents: number) => new Prisma.Decimal(cents).dividedBy(100);

/** "Braai pack is on sale at US$9.50." */
export const onSaleWords = (name: string, cents: number) => `${name} is on sale at ${formatMoney(cents / 100)}.`;

export async function createBundle(
  actor: RetailAuditActor,
  input: BundleInput,
): Promise<{ id: string; code: string; name: string; message: string }> {
  const { companyId } = actor;
  const made = await prisma.$transaction(async (tx) => {
    const checked = await check(tx, companyId, input.kind, input, null);
    const code = await reserveIdentifier(tx, { companyId, entity: "RETAIL_BUNDLE" });
    const bundle = await tx.retailBundle.create({
      data: {
        companyId,
        code,
        kind: input.kind,
        name: checked.name,
        barcode: checked.barcode,
        categoryId: checked.items[0]?.categoryId ?? null,
        price: money2(checked.priceCents),
        buyQuantity: checked.buyQuantity,
        days: checked.days,
        daysOfWeek: checked.daysOfWeek,
        endsOn: checked.endsOn,
        createdById: actor.userId,
        items: {
          create: checked.items.map((item, index) => ({ productId: item.productId, quantity: item.quantity, sortOrder: index })),
        },
      },
      select: { id: true },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.bundleCreated,
      entityType: "RetailBundle",
      entityId: bundle.id,
      payload: { code, name: checked.name, price: (checked.priceCents / 100).toFixed(2) },
    });
    return { id: bundle.id, code, name: checked.name, cents: checked.priceCents };
  });
  return { id: made.id, code: made.code, name: made.name, message: onSaleWords(made.name, made.cents) };
}

const LABELS = {
  name: "Name",
  items: "What is in it",
  buyQuantity: "Any",
  price: "Price",
  days: "On sale",
  until: "Until",
  barcode: "Barcode",
  categoryId: "Category",
  siteId: "Sites",
  tillButton: "Till button",
} as const;

export async function updateBundle(
  actor: RetailAuditActor,
  id: string,
  patch: BundlePatch,
): Promise<{ changed: number; name: string; message: string }> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const row = await tx.retailBundle.findFirst({ where: { id, companyId }, select: bundleSelect });
    if (!row || row.archivedAt) throw new BundleRefusal(404, "Bundle not found");
    if (row.stoppedAt) throw new BundleRefusal(409, "It was stopped. Duplicate it to sell it again.");

    const current: Omit<BundleInput, "kind"> = {
      name: row.name,
      items: row.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      buyQuantity: row.buyQuantity,
      price: toNumberOrZero(row.price).toFixed(2),
      days: row.days,
      daysOfWeek: row.daysOfWeek,
      until: day(row.endsOn),
      barcode: row.barcode,
    };
    const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } as Omit<BundleInput, "kind">;
    const checked = await check(tx, companyId, row.kind, next, id);

    const changes: Array<{ field: keyof typeof LABELS; from: string | null; to: string | null }> = [];
    const data: Prisma.RetailBundleUncheckedUpdateInput = {};
    if (checked.name !== row.name) {
      data.name = checked.name;
      changes.push({ field: "name", from: row.name, to: checked.name });
    }
    const itemsWord = (items: Array<{ quantity: number; name: string }>) => items.map((item) => `${item.quantity} × ${item.name}`).join(", ");
    const before = itemsWord(row.items.map((item) => ({ quantity: item.quantity, name: item.product.name })));
    const after = itemsWord(checked.items);
    if (before !== after) changes.push({ field: "items", from: before, to: after });
    if (checked.buyQuantity !== row.buyQuantity) {
      data.buyQuantity = checked.buyQuantity;
      changes.push({ field: "buyQuantity", from: String(row.buyQuantity ?? ""), to: String(checked.buyQuantity ?? "") });
    }
    if (!money2(checked.priceCents).equals(row.price)) {
      data.price = money2(checked.priceCents);
      changes.push({ field: "price", from: formatMoney(toNumberOrZero(row.price)), to: formatMoney(checked.priceCents / 100) });
    }
    if (checked.days !== row.days || checked.daysOfWeek.join() !== row.daysOfWeek.join()) {
      data.days = checked.days;
      data.daysOfWeek = checked.daysOfWeek;
      changes.push({ field: "days", from: daysWords(row.days, row.daysOfWeek), to: daysWords(checked.days, checked.daysOfWeek) });
    }
    const endsOn = checked.endsOn ? day(checked.endsOn) : null;
    if (endsOn !== day(row.endsOn)) {
      data.endsOn = checked.endsOn;
      changes.push({ field: "until", from: untilWords(day(row.endsOn)), to: untilWords(endsOn) });
    }
    if (patch.barcode !== undefined && checked.barcode !== row.barcode) {
      data.barcode = checked.barcode;
      changes.push({ field: "barcode", from: row.barcode, to: checked.barcode });
    }
    if (patch.categoryId !== undefined && patch.categoryId !== (row.category?.id ?? null)) {
      const category = patch.categoryId
        ? await tx.retailCategory.findFirst({ where: { id: patch.categoryId, companyId, archivedAt: null }, select: { id: true, name: true } })
        : null;
      if (patch.categoryId && !category) refuse("categoryId", "That category is not one of this shop's.");
      data.categoryId = category?.id ?? null;
      changes.push({ field: "categoryId", from: row.category?.name ?? "None", to: category?.name ?? "None" });
    }
    if (patch.siteId !== undefined && patch.siteId !== (row.site?.id ?? null)) {
      const site = patch.siteId
        ? await tx.site.findFirst({ where: { id: patch.siteId, companyId, isActive: true }, select: { id: true, name: true } })
        : null;
      if (patch.siteId && !site) refuse("siteId", "Choose one of your open sites.");
      data.siteId = site?.id ?? null;
      changes.push({ field: "siteId", from: row.site?.name ?? "All sites", to: site?.name ?? "All sites" });
    }
    if (patch.tillButton !== undefined && patch.tillButton !== row.tillButton) {
      data.tillButton = patch.tillButton;
      changes.push({ field: "tillButton", from: row.tillButton ? "Yes" : "No", to: patch.tillButton ? "Yes" : "No" });
    }
    if (changes.length === 0) return { changed: 0, name: row.name, message: `${row.name} saved.` };

    await tx.retailBundle.update({ where: { id }, data });
    if (changes.some((change) => change.field === "items")) {
      await tx.retailBundleItem.deleteMany({ where: { bundleId: id } });
      await tx.retailBundleItem.createMany({
        data: checked.items.map((item, index) => ({ bundleId: id, productId: item.productId, quantity: item.quantity, sortOrder: index })),
      });
    }
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.bundleChanged,
      entityType: "RetailBundle",
      entityId: id,
      payload: { name: checked.name, changes: changes.map((change) => ({ ...change, label: LABELS[change.field] })) },
    });
    for (const change of changes) {
      await auditRecordEdited(tx, {
        actor,
        entityType: "RetailBundle",
        entityId: id,
        field: change.field,
        label: LABELS[change.field],
        from: change.from,
        to: change.to,
      });
    }
    return { changed: changes.length, name: checked.name, message: `${checked.name} saved.` };
  });
}

/**
 * Pause, or put on sale again. Packs among the ids are products: pausing one
 * archives the case (off every till), putting it on sale sells it again.
 * A stopped or binned bundle is left as it is.
 */
export async function setBundlesPaused(actor: RetailAuditActor, ids: string[], paused: boolean): Promise<number> {
  const { companyId } = actor;
  const bundles = await prisma.retailBundle.findMany({
    where: { companyId, id: { in: ids }, archivedAt: null, stoppedAt: null },
    select: { id: true, name: true, pausedAt: true },
  });
  const packs = await prisma.product.findMany({ where: { companyId, id: { in: ids }, packOfId: { not: null }, archivedAt: null }, select: { id: true } });
  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const bundle of bundles) {
      if (Boolean(bundle.pausedAt) === paused) continue;
      await tx.retailBundle.update({ where: { id: bundle.id }, data: { pausedAt: paused ? new Date() : null } });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: paused ? RETAIL_AUDIT_EVENTS.bundlePaused : RETAIL_AUDIT_EVENTS.bundleResumed,
        entityType: "RetailBundle",
        entityId: bundle.id,
        payload: { name: bundle.name },
      });
      changed += 1;
    }
  });
  if (packs.length) changed += await setProductsSelling({ actor, ids: packs.map((pack) => pack.id), selling: !paused });
  return changed;
}

/** "Stop selling it": off every till for good; its sales history stays. */
export async function stopBundle(actor: RetailAuditActor, id: string): Promise<{ stoppedAt: string; name: string }> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const row = await tx.retailBundle.findFirst({ where: { id, companyId, archivedAt: null }, select: { id: true, name: true, stoppedAt: true } });
    if (!row) throw new BundleRefusal(404, "Bundle not found");
    if (row.stoppedAt) return { stoppedAt: row.stoppedAt.toISOString(), name: row.name };
    const at = new Date();
    await tx.retailBundle.update({ where: { id }, data: { stoppedAt: at } });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.bundleStopped,
      entityType: "RetailBundle",
      entityId: id,
      payload: { name: row.name },
    });
    return { stoppedAt: at.toISOString(), name: row.name };
  });
}

/** Bulk "Duplicate": each bundle as "<name> (copy)", a new code, on sale. Packs are left out: a pack is duplicated as a product. */
export async function duplicateBundles(actor: RetailAuditActor, ids: string[]): Promise<Array<{ id: string; name: string }>> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.retailBundle.findMany({
      where: { companyId, id: { in: ids }, archivedAt: null },
      orderBy: { code: "asc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const created: Array<{ id: string; name: string }> = [];
    for (const row of rows) {
      const code = await reserveIdentifier(tx, { companyId, entity: "RETAIL_BUNDLE" });
      const name = `${row.name} (copy)`;
      const copy = await tx.retailBundle.create({
        data: {
          companyId,
          code,
          kind: row.kind,
          name,
          barcode: null,
          categoryId: row.categoryId,
          price: row.price,
          buyQuantity: row.buyQuantity,
          days: row.days,
          daysOfWeek: row.daysOfWeek,
          endsOn: row.endsOn,
          siteId: row.siteId,
          tillButton: row.tillButton,
          createdById: actor.userId,
          items: { create: row.items.map((item) => ({ productId: item.productId, quantity: item.quantity, sortOrder: item.sortOrder })) },
        },
        select: { id: true },
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.bundleCreated,
        entityType: "RetailBundle",
        entityId: copy.id,
        payload: { code, name, price: money(row.price).toFixed(2), from: row.name },
      });
      created.push({ id: copy.id, name });
    }
    return created;
  });
}

export { WEEKDAY_SHORT };
