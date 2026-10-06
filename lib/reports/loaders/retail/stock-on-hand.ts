import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { coverFill, coverLabel, onHandLabel, unitWord } from "@/lib/retail/products/figures";
import { STOCK_LEVEL_LABEL } from "@/lib/retail/stock/levels";
import { loadOnHand } from "@/lib/retail/stock/on-hand";

/**
 * On hand (30-stock 4.1, `retail-stock-on-hand`): one row per stock line, from
 * `loadOnHand` — the helper the Stock panel's badge counts with, so "5 low"
 * and the Low and Out tabs agree. A shop holds hundreds of lines, so the
 * engine narrows, sorts, totals and pages in memory.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Least cover first: Out on top, then the fewest days, then lines that do not sell. */
function coverRank(level: string, days: number | null): number {
  if (level === STOCK_LEVEL_LABEL.OUT) return -1;
  return days === null ? Number.MAX_SAFE_INTEGER : days;
}

/**
 * The phone card's meta: "AMARULA-750 · reorder at 12 · 6 days". A part with
 * nothing to say is left out — no level set, or no cover because it is Out —
 * so an Out line with no level reads "JAGER-750", never "reorder at — · —".
 */
export function onHandCardMeta(code: string | null, reorderAt: number | null, cover: string | null): string {
  return [code, reorderAt === null ? null : `reorder at ${reorderAt}`, cover].filter((part): part is string => Boolean(part)).join(" · ");
}

async function loadStockOnHand(ctx: ReportContext) {
  const [lines, categories] = await Promise.all([
    loadOnHand(ctx.companyId),
    prisma.retailCategory.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } }),
  ]);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));

  return result(
    lines.map((line): ReportRow => {
      const level = STOCK_LEVEL_LABEL[line.level];
      const out = line.level === "OUT";
      const cover = out ? null : (coverLabel(line.coverDays) ?? "Not sold in 30 days");
      const label = onHandLabel(line.onHand, line.unit);
      return {
        id: line.id,
        productId: line.productId,
        product: line.product,
        code: line.code,
        barcode: line.barcode,
        level,
        levelKey: line.level,
        site: line.site,
        siteId: line.siteId,
        place: line.place,
        placeId: line.placeId,
        categoryId: line.categoryId,
        category: line.categoryId ? (categoryName.get(line.categoryId) ?? null) : null,
        onHand: line.onHand,
        unitWord: unitWord(line.onHand, line.unit),
        onHandLabel: label,
        reorderAt: line.reorderAt,
        cover,
        coverDays: line.coverDays,
        coverPct: out || line.coverDays === null ? null : coverFill(line.coverDays),
        coverRank: coverRank(level, line.coverDays),
        value: round2(line.onHand * (line.unitCost ?? 0)),
        state: line.archived ? "Archived" : "Selling",
        cardMeta: onHandCardMeta(line.code, line.reorderAt, cover),
      };
    }),
  );
}

async function onHandOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [categories, sites, places] = await Promise.all([
    prisma.retailCategory.findMany({
      where: { companyId: ctx.companyId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.site.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { isActive: true, site: { companyId: ctx.companyId, isActive: true } },
      select: { id: true, name: true, site: { select: { name: true } } },
      orderBy: [{ site: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return {
    category: categories.map((category) => ({ value: category.id, label: category.name })),
    site: sites.map((site) => ({ value: site.id, label: site.name })),
    place: places.map((place) => ({ value: place.id, label: `${place.site.name} · ${place.name}` })),
  };
}

export const STOCK_ON_HAND_LOADERS: Record<string, ReportLoader> = {
  "retail-stock-on-hand": { load: loadStockOnHand, options: onHandOptions },
};
