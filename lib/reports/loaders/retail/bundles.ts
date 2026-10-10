import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import { defaultPrices, loadBundleView, loadBundleViews, type BundleView } from "@/lib/retail/bundles/service";
import { BUNDLE_KIND_WORDS } from "@/lib/retail/bundles/words";
import { toNumberOrZero } from "@/lib/money";
import { formatCount, formatMoney, formatWhen } from "@/lib/workspace/format";

/**
 * Bundles and packs (PRD-08): the cases (products with a single) and the
 * bundles and buy-more deals, in one list read in memory; and a bundle
 * record's tabs. A shop has a handful of each.
 */

const DAY = 24 * 60 * 60 * 1000;
const KIND_RANK = { PACK: 0, FIXED_SET: 1, BUY_MORE: 2 } as const;

/** "Saves US$2.30 · can make 4". */
const cardMeta = (saves: number, canMake: number | null) =>
  `Saves ${formatMoney(saves)}${canMake === null ? "" : ` · can make ${formatCount(canMake)}`}`;

function bundleRow(view: BundleView): ReportRow {
  return {
    id: view.id,
    bundleId: view.id,
    name: view.name,
    kindKey: view.kind,
    kindRank: KIND_RANK[view.kind],
    stateKey: view.state,
    kind: view.state === "PAUSED" ? "Paused" : view.state === "STOPPED" ? "Stopped" : BUNDLE_KIND_WORDS[view.kind],
    madeOf: view.madeOf,
    price: view.price,
    onTheirOwn: view.boughtApart,
    saves: view.saves,
    savesTone: view.saves > 0 ? "ok" : null,
    canMake: view.canMake,
    canMakeTone: view.canMakeLow ? "warn" : null,
    sold30: view.sold30,
    barcode: view.barcode,
    category: view.category?.name ?? null,
    categoryId: view.category?.id ?? null,
    cardMeta: cardMeta(view.saves, view.canMake),
  };
}

/** The cases: each made of its single, at its own price, its own on hand the cases it can sell. */
async function packRows(ctx: ReportContext, now: Date): Promise<ReportRow[]> {
  const packs = await prisma.product.findMany({
    where: { companyId: ctx.companyId, archivedAt: null, packOfId: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      barcode: true,
      isActive: true,
      packSize: true,
      packOfId: true,
      categoryId: true,
      retailCategory: { select: { name: true } },
      packOf: { select: { name: true } },
      inventoryItems: { select: { currentStock: true } },
    },
  });
  if (packs.length === 0) return [];
  const ids = packs.flatMap((pack) => [pack.id, pack.packOfId!]);
  const [prices, lines] = await Promise.all([
    defaultPrices(prisma, ctx.companyId, ids),
    prisma.retailSaleLine.findMany({
      where: {
        companyId: ctx.companyId,
        productId: { in: packs.map((pack) => pack.id) },
        sale: { status: "POSTED", saleType: { in: ["SALE", "REFUND"] }, postedAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      },
      select: { productId: true, quantity: true, sale: { select: { saleType: true } } },
    }),
  ]);
  const sold = new Map<string, number>();
  for (const line of lines) {
    const units = Math.abs(toNumberOrZero(line.quantity)) * (line.sale.saleType === "REFUND" ? -1 : 1);
    sold.set(line.productId!, (sold.get(line.productId!) ?? 0) + units);
  }
  return packs.map((pack): ReportRow => {
    const price = prices.get(pack.id) ?? 0;
    const apart = Math.round((prices.get(pack.packOfId!) ?? 0) * (pack.packSize ?? 0) * 100) / 100;
    const saves = Math.round((apart - price) * 100) / 100;
    const onHand = pack.inventoryItems.reduce((sum, line) => sum + toNumberOrZero(line.currentStock), 0);
    return {
      id: pack.id,
      packId: pack.id,
      name: pack.name,
      kindKey: "PACK",
      kindRank: KIND_RANK.PACK,
      stateKey: pack.isActive ? "ON_SALE" : "PAUSED",
      kind: pack.isActive ? "Pack" : "Paused",
      madeOf: `${pack.packSize ?? "?"} × ${pack.packOf?.name ?? "its single"}`,
      price,
      onTheirOwn: apart,
      saves,
      savesTone: saves > 0 ? "ok" : null,
      canMake: onHand,
      canMakeTone: onHand <= 3 ? "warn" : null,
      sold30: Math.max(0, sold.get(pack.id) ?? 0),
      barcode: pack.barcode,
      category: pack.retailCategory?.name ?? null,
      categoryId: pack.categoryId,
      cardMeta: cardMeta(saves, onHand),
    };
  });
}

async function loadBundles(ctx: ReportContext) {
  const now = new Date();
  const [packs, views] = await Promise.all([packRows(ctx, now), loadBundleViews(ctx.companyId, {}, ctx.role, now)]);
  return result([...packs, ...views.map(bundleRow)]);
}

async function bundleOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const categories = await prisma.retailCategory.findMany({
    where: { companyId: ctx.companyId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { category: categories.map((category) => ({ value: category.id, label: category.name })) };
}

/** The bundle a record tab is opened on, when it is this company's. */
async function bundleOf(ctx: ReportContext, params: ReportParams) {
  if (!params.bundle) return null;
  return loadBundleView(ctx.companyId, params.bundle, ctx.role);
}

async function loadItems(ctx: ReportContext, params: ReportParams) {
  const bundle = await bundleOf(ctx, params);
  if (!bundle) return result([]);
  return result(
    bundle.items.map(
      (item, index): ReportRow => ({
        id: item.productId,
        productId: item.productId,
        bundleId: bundle.id,
        order: index,
        product: item.name,
        quantity: item.quantity,
        onTheirOwn: Math.round(item.each * item.quantity * 100) / 100,
        onHand: item.onHand,
        makes: item.makes,
        limitTone: item.limiting ? "warn" : null,
      }),
    ),
  );
}

/** Each bundle sold (its lines share a `bundleRef`): when, the sale, the till, what it took and what it saved. */
async function loadSales(ctx: ReportContext, params: ReportParams) {
  if (!params.bundle) return result([]);
  const lines = await prisma.retailSaleLine.findMany({
    where: { companyId: ctx.companyId, bundleId: params.bundle, sale: { status: "POSTED", saleType: "SALE" } },
    select: {
      bundleRef: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      sale: { select: { id: true, saleNo: true, postedAt: true, createdAt: true, register: { select: { name: true } } } },
    },
  });
  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const ref = line.bundleRef ?? `${line.sale.id}`;
    groups.set(ref, [...(groups.get(ref) ?? []), line]);
  }
  return result(
    [...groups.entries()].map(([ref, group]): ReportRow => {
      const sale = group[0]!.sale;
      const at = sale.postedAt ?? sale.createdAt;
      const price = group.reduce((sum, line) => sum + toNumberOrZero(line.lineTotal), 0);
      const shelf = group.reduce((sum, line) => sum + toNumberOrZero(line.unitPrice) * toNumberOrZero(line.quantity), 0);
      return {
        id: ref,
        bundleId: params.bundle!,
        saleId: sale.id,
        saleNo: sale.saleNo,
        at: at.toISOString(),
        whenText: formatWhen(at.toISOString()),
        till: sale.register?.name ?? "Back office",
        price: Math.round(price * 100) / 100,
        saved: Math.max(0, Math.round((shelf - price) * 100) / 100),
      };
    }),
  );
}

export const BUNDLE_LOADERS: Record<string, ReportLoader> = {
  "retail-bundles": { load: loadBundles, options: bundleOptions },
  "retail-bundle-items": { load: loadItems },
  "retail-bundle-sales": { load: loadSales },
};
