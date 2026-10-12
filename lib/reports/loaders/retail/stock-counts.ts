import { multiplyMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
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
  const limits = await getApprovalLimits(ctx.companyId);
  const ownerOver = limits.countDifferences === "OWNER_OVER_LIMIT" ? limits.countOwnerOver.toNumber() : null;
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
        // The bulk ask's "for 41 lines" and "A count over US$100.00 waits for the owner".
        lineCount: count.lines.length,
        ownerOver,
      };
    }),
  );
}

/**
 * A count's lines (`retail-stock-count-differences`, `retail-stock-count-lines`,
 * the `count` parent), in the phone's order. Expected is what was on hand
 * when the line was counted (else when the count started); Differences holds
 * the lines that differ once the count is in, and nothing while counting.
 */
function loadCountLines(differences: boolean) {
  return async (ctx: ReportContext, params: ReportParams) => {
    if (!params.count) return result([]);
    const count = await prisma.retailStockCount.findFirst({
      where: { id: params.count, companyId: ctx.companyId },
      select: { id: true, status: true, blind: true, counterId: true },
    });
    if (!count) return result([]);
    if (differences && count.status === "COUNTING") return result([]);
    const seeCost = canSeeRetailCostPrice(ctx.role);
    const hideExpected = count.blind && count.status === "COUNTING" && count.counterId === ctx.userId;
    const lines = await prisma.retailStockCountLine.findMany({
      where: { countId: count.id, ...(differences ? { difference: { not: 0 } } : {}) },
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      select: {
        id: true,
        productId: true,
        expected: true,
        expectedAtCount: true,
        counted: true,
        difference: true,
        unitCost: true,
        inventoryItem: { select: { name: true, product: { select: { name: true } } } },
      },
    });
    return result(
      lines.map((line, index): ReportRow => {
        const difference = hideExpected ? null : (line.difference?.toNumber() ?? null);
        const counted = line.counted?.toNumber() ?? null;
        return {
          id: line.id,
          countId: count.id,
          productId: line.productId,
          order: index,
          product: line.inventoryItem.product?.name ?? line.inventoryItem.name,
          expected: hideExpected ? null : (line.expectedAtCount ?? line.expected).toNumber(),
          counted,
          difference,
          value: seeCost && difference !== null ? multiplyMoney(line.difference!, line.unitCost).toNumber() : null,
          countedWords: counted === null ? "Not counted yet" : `${counted} counted`,
        };
      }),
    );
  };
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
  "retail-stock-count-differences": { load: loadCountLines(true) },
  "retail-stock-count-lines": { load: loadCountLines(false) },
};
