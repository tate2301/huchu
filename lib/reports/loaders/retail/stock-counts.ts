import { prisma } from "@/lib/prisma";
import { result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { canSeeRetailCostPrice } from "@/lib/retail/permission-matrix";
import { COUNT_STATE, countWhen, linesWords } from "@/lib/retail/stock/count-words";
import { formatMoney } from "@/lib/workspace/format";

/**
 * Counts (30-stock 4.1, `retail-stock-counts`): every count of the shop, in
 * memory (a shop counts a few times a week). Differ and Difference are read
 * off the counted lines once a count is sent (approved counts keep the value
 * they were approved at); while counting they are empty. Difference is at
 * cost, and only for roles that may see cost.
 */
async function loadCounts(ctx: ReportContext) {
  const seeCost = canSeeRetailCostPrice(ctx.role);
  const now = new Date();
  const counts = await prisma.retailStockCount.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ createdAt: "desc" }, { countNo: "desc" }],
    take: TAKE,
    select: {
      id: true,
      countNo: true,
      name: true,
      status: true,
      siteId: true,
      counterId: true,
      createdAt: true,
      submittedAt: true,
      approvedAt: true,
      cancelledAt: true,
      differenceValue: true,
      site: { select: { name: true } },
      counter: { select: { name: true } },
      lines: { select: { counted: true, difference: true, unitCost: true } },
    },
  });
  return result(
    counts.map((count): ReportRow => {
      const counting = count.status === "COUNTING";
      const counted = count.lines.filter((line) => line.counted !== null).length;
      const differing = count.lines.filter((line) => line.difference && !line.difference.isZero());
      const atCost =
        count.differenceValue?.toNumber() ??
        differing.reduce((sum, line) => sum + Math.round(line.difference!.toNumber() * line.unitCost.toNumber() * 100), 0) / 100;
      const difference = counting ? null : atCost;
      const lines = linesWords(count.status, counted, count.lines.length);
      const state = COUNT_STATE[count.status];
      return {
        id: count.id,
        countNo: count.countNo,
        name: count.name,
        status: count.status,
        siteId: count.siteId,
        site: count.site.name,
        counterId: count.counterId,
        counter: count.counter.name,
        when: countWhen(count, now),
        createdAt: count.createdAt.toISOString(),
        lines,
        differ: counting ? null : differing.length,
        differWords: counting ? `${counted} counted` : `${differing.length} differ`,
        difference: seeCost ? difference : null,
        size: seeCost && difference !== null ? Math.abs(difference) : null,
        figure: seeCost && difference !== null ? formatMoney(difference) : lines,
        state: state.label,
        tone: state.tone,
      };
    }),
  );
}

/** The Site and Counted by filters: the sites and the people the shop's counts name. */
async function countOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [sites, people] = await Promise.all([
    prisma.site.findMany({
      where: { companyId: ctx.companyId, OR: [{ isActive: true }, { retailStockCounts: { some: {} } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { companyId: ctx.companyId, retailCountsToCount: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    site: sites.map((site) => ({ value: site.id, label: site.name })),
    counter: people.map((person) => ({ value: person.id, label: person.name })),
  };
}

export const STOCK_COUNT_LOADERS: Record<string, ReportLoader> = {
  "retail-stock-counts": { load: loadCounts, options: countOptions },
};
