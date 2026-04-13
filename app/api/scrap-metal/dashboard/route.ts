import { NextRequest, NextResponse } from "next/server";
import {
  addDays,
  addHours,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const STORAGE_TREND_WEEKS = 12;
const MATERIAL_LIMIT = 6;
const CLOSED_SALE_STATUSES = new Set(["APPROVED", "COMPLETED"]);
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
type SnapshotWindow = "day" | "week" | "month" | "all";
type SnapshotGranularity = "hour" | "day" | "month";

function resolveMaterialLabel(input: {
  materialName?: string | null;
  materialCode?: string | null;
  category?: string | null;
}) {
  return input.materialName?.trim() || input.materialCode?.trim() || input.category?.trim() || "Other";
}

function resolveLatestPrice(
  prices: Array<{ materialId: string | null; category: string; pricePerKg: number }>,
  materialId: string | null | undefined,
  category: string,
) {
  return (
    prices.find((price) => price.materialId === (materialId ?? null) && price.category === category) ??
    prices.find((price) => price.materialId === null && price.category === category) ??
    null
  );
}

function parseSnapshotWindow(input: string | null): SnapshotWindow {
  const normalized = String(input ?? "").trim().toLowerCase();
  if (normalized === "day" || normalized === "daily") return "day";
  if (normalized === "week" || normalized === "weekly") return "week";
  if (normalized === "month" || normalized === "monthly") return "month";
  if (normalized === "all" || normalized === "all-time" || normalized === "alltime") return "all";
  return "month";
}

function parseAnchorDate(input: string | null, fallback: Date) {
  if (!input) return fallback;
  try {
    const parsed = parseISO(input);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function resolveWindowBounds(window: SnapshotWindow, anchor: Date): { start: Date | null; end: Date } {
  if (window === "day") {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  if (window === "week") {
    return {
      start: startOfWeek(anchor, { weekStartsOn: 1 }),
      end: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  }
  if (window === "month") {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
  return { start: null, end: endOfDay(anchor) };
}

function resolveSnapshotGranularity(window: SnapshotWindow): SnapshotGranularity {
  if (window === "day") return "hour";
  if (window === "all") return "month";
  return "day";
}

function startOfGranularityBucket(date: Date, granularity: SnapshotGranularity) {
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  return startOfMonth(date);
}

function addGranularityBucket(date: Date, granularity: SnapshotGranularity) {
  if (granularity === "hour") return addHours(date, 1);
  if (granularity === "day") return addDays(date, 1);
  return addMonths(date, 1);
}

function formatGranularityLabel(date: Date, granularity: SnapshotGranularity) {
  if (granularity === "hour") return format(date, "HH:mm");
  if (granularity === "day") return format(date, "MMM d");
  return format(date, "MMM yyyy");
}

function isWithinRange(date: Date, start: Date | null, end: Date) {
  if (start && date < start) return false;
  if (date > end) return false;
  return true;
}

function describeWindow(window: SnapshotWindow) {
  if (window === "day") return "Daily";
  if (window === "week") return "Weekly";
  if (window === "month") return "Monthly";
  return "All Time";
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const now = new Date();
    const { searchParams } = new URL(request.url);
    const windowMode = parseSnapshotWindow(searchParams.get("window"));
    const anchorDate = parseAnchorDate(searchParams.get("anchorDate"), now);
    const { start: windowStart, end: windowEnd } = resolveWindowBounds(windowMode, anchorDate);
    const trendStart = startOfWeek(subWeeks(windowEnd, STORAGE_TREND_WEEKS - 1), {
      weekStartsOn: 1,
    });
    const trendBuckets = Array.from({ length: STORAGE_TREND_WEEKS }, (_, index) =>
      startOfWeek(subWeeks(windowEnd, STORAGE_TREND_WEEKS - 1 - index), {
        weekStartsOn: 1,
      }),
    );
    const trendBucketKeys = trendBuckets.map((bucket) => bucket.toISOString());
    const fetchStart = windowStart && windowStart < trendStart ? windowStart : trendStart;
    const purchaseDateWhere: { gte?: Date; lte?: Date } = { gte: fetchStart, lte: windowEnd };
    const saleDateWhere: { gte?: Date; lte?: Date } = { gte: fetchStart, lte: windowEnd };

    const [
      recentPurchases,
      recentSales,
      batches,
      materialsCount,
      activeMaterialsCount,
      balances,
      settlementBatches,
      overduePayments,
      openBatches,
      unbatchedPurchases,
      priceRows,
      purchaseTotalsByEmployee,
      heldPurchases,
      heldSales,
      pendingSupplierPayments,
      pendingSupplierPaymentsCount,
      pendingSupplierPaymentsTotals,
      balanceEntryNet,
    ] = await Promise.all([
      prisma.scrapMetalPurchase.findMany({
        where: {
          companyId,
          purchaseDate: purchaseDateWhere,
        },
        select: {
          id: true,
          purchaseDate: true,
          createdAt: true,
          totalAmount: true,
          weight: true,
          category: true,
          status: true,
          purchasePaymentId: true,
          sellerName: true,
          employeeId: true,
          material: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ purchaseDate: "asc" }],
      }),
      prisma.scrapMetalSale.findMany({
        where: {
          companyId,
          saleDate: saleDateWhere,
        },
        select: {
          id: true,
          saleDate: true,
          createdAt: true,
          totalAmount: true,
          soldWeight: true,
          status: true,
          buyerName: true,
          batch: { select: { batchNumber: true, category: true, materialId: true, totalWeight: true } },
          material: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ saleDate: "asc" }],
      }),
      prisma.scrapMetalBatch.findMany({
        where: { companyId },
        select: {
          id: true,
          batchNumber: true,
          status: true,
          totalWeight: true,
          category: true,
          collectionStartDate: true,
          material: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
      }),
      prisma.scrapMaterial.count({ where: { companyId } }),
      prisma.scrapMaterial.count({ where: { companyId, isActive: true } }),
      prisma.scrapMetalEmployeeBalance.findMany({
        where: { companyId },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeId: true,
            },
          },
        },
        orderBy: [{ balance: "desc" }, { lastUpdated: "desc" }],
        take: 20,
      }),
      prisma.irregularPayoutBatch.findMany({
        where: { companyId, source: "SCRAP" },
        include: {
          items: { select: { id: true, amount: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 20,
      }),
      prisma.employeePayment.findMany({
        where: {
          employee: { companyId },
          type: "IRREGULAR",
          payoutSource: "SCRAP",
          status: { in: ["DUE", "PARTIAL"] },
        },
        include: {
          employee: { select: { id: true, name: true, employeeId: true } },
        },
        orderBy: [{ dueDate: "asc" }],
        take: 20,
      }),
      prisma.scrapMetalBatch.findMany({
        where: {
          companyId,
          status: {
            in: ["COLLECTING", "READY"],
          },
        },
        select: {
          id: true,
          totalWeight: true,
          status: true,
          category: true,
          materialId: true,
          material: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.scrapMetalPurchase.findMany({
        where: {
          companyId,
          batchItems: { none: {} },
        },
        select: {
          id: true,
          weight: true,
          totalAmount: true,
          category: true,
          materialId: true,
          material: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.scrapMetalPrice.findMany({
        where: { companyId },
        select: {
          materialId: true,
          category: true,
          pricePerKg: true,
          effectiveDate: true,
        },
        orderBy: [{ effectiveDate: "desc" }],
      }),
      prisma.scrapMetalPurchase.groupBy({
        by: ["employeeId"],
        where: { companyId },
        _sum: {
          totalAmount: true,
          weight: true,
        },
        _count: {
          id: true,
        },
      }),
      prisma.scrapMetalPurchase.findMany({
        where: {
          companyId,
          status: "DRAFT",
        },
        select: {
          id: true,
          purchaseDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 300,
      }),
      prisma.scrapMetalSale.findMany({
        where: {
          companyId,
          status: "DRAFT",
        },
        select: {
          id: true,
          saleDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 300,
      }),
      prisma.scrapMetalPurchase.findMany({
        where: {
          companyId,
          status: "POSTED",
          purchasePaymentId: null,
          purchaseDate: { lte: windowEnd },
        },
        select: {
          id: true,
          purchaseNumber: true,
          purchaseDate: true,
          sellerName: true,
          totalAmount: true,
          currency: true,
        },
        orderBy: { purchaseDate: "desc" },
        take: 20,
      }),
      prisma.scrapMetalPurchase.count({
        where: {
          companyId,
          status: "POSTED",
          purchasePaymentId: null,
          purchaseDate: { lte: windowEnd },
        },
      }),
      prisma.scrapMetalPurchase.aggregate({
        where: {
          companyId,
          status: "POSTED",
          purchasePaymentId: null,
          purchaseDate: { lte: windowEnd },
        },
        _sum: { totalAmount: true },
      }),
      prisma.scrapMetalBalanceEntry.aggregate({
        where: { companyId },
        _sum: { amountDelta: true },
      }),
    ]);

    const purchases = recentPurchases;
    const sales = recentSales;
    const periodPurchases = purchases.filter((purchase) =>
      isWithinRange(purchase.purchaseDate, windowStart, windowEnd),
    );
    const periodSales = sales.filter((sale) => isWithinRange(sale.saleDate, windowStart, windowEnd));
    const periodClosedSales = periodSales.filter((sale) => CLOSED_SALE_STATUSES.has(sale.status));
    const elapsedHoursInWindow =
      windowMode === "day"
        ? Math.max(
            isWithinRange(now, windowStart, windowEnd)
              ? (now.getTime() - (windowStart?.getTime() ?? now.getTime())) / MS_PER_HOUR
              : 24,
            1 / 60,
          )
        : windowMode === "week"
          ? 24 * 7
          : windowMode === "month"
            ? Math.max((windowEnd.getTime() - (windowStart?.getTime() ?? windowEnd.getTime())) / MS_PER_HOUR, 24)
            : Math.max(
                periodPurchases.length || periodClosedSales.length
                  ? (windowEnd.getTime() -
                      Math.min(
                        ...[
                          ...periodPurchases.map((purchase) => purchase.purchaseDate.getTime()),
                          ...periodClosedSales.map((sale) => sale.saleDate.getTime()),
                        ],
                      )) /
                      MS_PER_HOUR
                  : 24,
                24,
              );
    const ticketsProcessedInWindow = periodPurchases.length + periodClosedSales.length;
    const ticketsProcessedPerHour = ticketsProcessedInWindow / elapsedHoursInWindow;
    const heldTickets = [...heldPurchases, ...heldSales];
    const oldestHeldCreatedAt = heldTickets.length
      ? heldTickets.reduce(
          (oldest, ticket) =>
            new Date(ticket.createdAt).getTime() < oldest ? new Date(ticket.createdAt).getTime() : oldest,
          new Date(heldTickets[0].createdAt).getTime(),
        )
      : null;
    const heldTicketOldestAgeHours = oldestHeldCreatedAt
      ? Math.max(0, (now.getTime() - oldestHeldCreatedAt) / MS_PER_HOUR)
      : 0;
    const readyBatches = batches.filter((batch) => batch.status === "READY");
    const collectingBatches = batches.filter((batch) => batch.status === "COLLECTING");
    const pendingSales = periodSales.filter((sale) => sale.status === "PENDING_APPROVAL");
    const approvedSales = periodSales.filter((sale) => sale.status === "APPROVED");
    const completedSales = periodSales.filter((sale) => sale.status === "COMPLETED");
    const overdueSettlementAmount = overduePayments.reduce(
      (sum, payment) => sum + (payment.amountUsd ?? payment.amount ?? 0),
      0,
    );
    const amountOwedToCompany = balances.reduce(
      (sum, balance) => sum + (balance.balance > 0 ? balance.balance : 0),
      0,
    );
    const amountCompanyOwes = balances.reduce(
      (sum, balance) => sum + (balance.balance < 0 ? Math.abs(balance.balance) : 0),
      0,
    );

    const latestPrices = priceRows.reduce<Array<{ materialId: string | null; category: string; pricePerKg: number }>>(
      (collection, price) => {
        const alreadyIncluded = collection.some(
          (entry) => entry.materialId === price.materialId && entry.category === price.category,
        );
        if (alreadyIncluded) return collection;
        return [
          ...collection,
          {
            materialId: price.materialId,
            category: price.category,
            pricePerKg: price.pricePerKg,
          },
        ];
      },
      [],
    );

    const yardStockMap = new Map<
      string,
      {
        id: string;
        label: string;
        category: string;
        materialId: string | null;
        weight: number;
        value: number;
      }
    >();
    const accumulateYardStock = (input: {
      id: string;
      label: string;
      category: string;
      materialId: string | null;
      weight: number;
    }) => {
      const current =
        yardStockMap.get(input.label) ?? {
          id: input.id,
          label: input.label,
          category: input.category,
          materialId: input.materialId,
          weight: 0,
          value: 0,
        };
      current.weight += input.weight;
      yardStockMap.set(input.label, current);
    };

    for (const batch of openBatches) {
      const label = resolveMaterialLabel({
        materialName: batch.material?.name,
        materialCode: batch.material?.code,
        category: batch.category,
      });
      accumulateYardStock({
        id: batch.id,
        label,
        category: batch.category,
        materialId: batch.materialId ?? null,
        weight: batch.totalWeight,
      });
    }
    for (const purchase of unbatchedPurchases) {
      const label = resolveMaterialLabel({
        materialName: purchase.material?.name,
        materialCode: purchase.material?.code,
        category: purchase.category,
      });
      accumulateYardStock({
        id: purchase.id,
        label,
        category: purchase.category,
        materialId: purchase.materialId ?? null,
        weight: purchase.weight,
      });
    }

    const yardMaterials = Array.from(yardStockMap.values())
      .map((row) => {
        const price = resolveLatestPrice(latestPrices, row.materialId, row.category);
        const value = row.weight * (price?.pricePerKg ?? 0);
        return {
          ...row,
          value,
        };
      })
      .sort((left, right) => right.weight - left.weight);
    const yardStockWeight = yardMaterials.reduce((sum, row) => sum + row.weight, 0);
    const yardStockValue = yardMaterials.reduce((sum, row) => sum + row.value, 0);

    const currentWeightByLabel = new Map(yardMaterials.map((row) => [row.label, row.weight] as const));
    const recentNetChangeByLabel = new Map<string, number>();
    const bucketDeltas = new Map<string, Map<string, number>>();
    const addBucketDelta = (label: string, bucketKey: string, delta: number) => {
      const bucketMap = bucketDeltas.get(label) ?? new Map<string, number>();
      bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + delta);
      bucketDeltas.set(label, bucketMap);
      recentNetChangeByLabel.set(label, (recentNetChangeByLabel.get(label) ?? 0) + delta);
    };

    for (const purchase of purchases) {
      const bucketKey = startOfWeek(purchase.purchaseDate, { weekStartsOn: 1 }).toISOString();
      const label = resolveMaterialLabel({
        materialName: purchase.material?.name,
        materialCode: purchase.material?.code,
        category: purchase.category,
      });
      addBucketDelta(label, bucketKey, purchase.weight);
    }

    for (const sale of sales) {
      if (!CLOSED_SALE_STATUSES.has(sale.status)) continue;
      const bucketKey = startOfWeek(sale.saleDate, { weekStartsOn: 1 }).toISOString();
      const label = resolveMaterialLabel({
        materialName: sale.material?.name,
        materialCode: sale.material?.code,
        category: sale.batch.category,
      });
      addBucketDelta(label, bucketKey, -sale.soldWeight);
    }

    const trendLabels = Array.from(
      new Set([
        ...yardMaterials.map((row) => row.label),
        ...recentNetChangeByLabel.keys(),
      ]),
    )
      .map((label) => ({
        label,
        currentWeight: currentWeightByLabel.get(label) ?? 0,
        activityWeight: Math.abs(recentNetChangeByLabel.get(label) ?? 0),
      }))
      .sort(
        (left, right) =>
          right.currentWeight - left.currentWeight || right.activityWeight - left.activityWeight,
      )
      .slice(0, MATERIAL_LIMIT)
      .map((entry) => entry.label);

    const storageTrend = trendBuckets.map((bucket) => {
      const bucketKey = bucket.toISOString();
      const row: Record<string, string | number> = {
        label: format(bucket, "MMM d"),
        tooltipLabel: `Week of ${format(bucket, "MMM d, yyyy")}`,
      };

      for (const label of trendLabels) {
        const startingWeight =
          (currentWeightByLabel.get(label) ?? 0) - (recentNetChangeByLabel.get(label) ?? 0);
        let runningWeight = startingWeight;
        for (const key of trendBucketKeys) {
          if (key === bucketKey) {
            runningWeight += bucketDeltas.get(label)?.get(key) ?? 0;
            break;
          }
          runningWeight += bucketDeltas.get(label)?.get(key) ?? 0;
        }
        row[label] = Math.max(runningWeight, 0);
      }

      return row;
    });

    const materialMap = new Map<
      string,
      {
        label: string;
        purchaseWeight: number;
        saleWeight: number;
        purchaseValue: number;
        saleValue: number;
      }
    >();
    for (const purchase of periodPurchases) {
      const key = resolveMaterialLabel({
        materialName: purchase.material?.name,
        materialCode: purchase.material?.code,
        category: purchase.category,
      });
      const current =
        materialMap.get(key) ?? { label: key, purchaseWeight: 0, saleWeight: 0, purchaseValue: 0, saleValue: 0 };
      current.purchaseWeight += purchase.weight;
      current.purchaseValue += purchase.totalAmount;
      materialMap.set(key, current);
    }

    const weightedAverageCostByMaterial = Array.from(materialMap.values())
      .filter((entry) => entry.purchaseWeight > 0)
      .map((entry) => ({
        label: entry.label,
        weightedAverageCostPerKg: entry.purchaseValue / entry.purchaseWeight,
        purchaseWeight: entry.purchaseWeight,
        purchaseValue: entry.purchaseValue,
      }))
      .sort((left, right) => right.purchaseWeight - left.purchaseWeight)
      .slice(0, 12);

    const monthSupplierMap = new Map<
      string,
      {
        supplier: string;
        weightKg: number;
        spend: number;
        currency: string;
        tickets: number;
        months: Set<string>;
      }
    >();
    for (const purchase of periodPurchases) {
      const supplier = purchase.sellerName?.trim() || "Unknown supplier";
      const current = monthSupplierMap.get(supplier) ?? {
        supplier,
        weightKg: 0,
        spend: 0,
        currency: "USD",
        tickets: 0,
        months: new Set<string>(),
      };
      current.weightKg += purchase.weight;
      current.spend += purchase.totalAmount;
      current.tickets += 1;
      current.months.add(format(purchase.purchaseDate, "yyyy-MM"));
      monthSupplierMap.set(supplier, current);
    }

    const avgSalePriceByCategory = new Map<string, number>();
    const saleTotalsByCategory = new Map<string, { value: number; weight: number }>();
    for (const sale of periodClosedSales) {
      const key = sale.batch.category;
      const current = saleTotalsByCategory.get(key) ?? { value: 0, weight: 0 };
      current.value += sale.totalAmount;
      current.weight += sale.soldWeight;
      saleTotalsByCategory.set(key, current);
    }
    for (const [category, totals] of saleTotalsByCategory) {
      avgSalePriceByCategory.set(category, totals.weight > 0 ? totals.value / totals.weight : 0);
    }

    const supplierPerformance = Array.from(monthSupplierMap.values())
      .map((supplier) => {
        const supplierPurchases = periodPurchases.filter(
          (purchase) => (purchase.sellerName?.trim() || "Unknown supplier") === supplier.supplier,
        );
        const estimatedSellPricePerKg =
          supplierPurchases.length > 0
            ? supplierPurchases.reduce(
                (sum, purchase) => sum + (avgSalePriceByCategory.get(purchase.category) ?? 0),
                0,
              ) / supplierPurchases.length
            : 0;
        const estimatedRevenue = supplier.weightKg * estimatedSellPricePerKg;
        const estimatedMarginContribution = estimatedRevenue - supplier.spend;
        return {
          supplier: supplier.supplier,
          tickets: supplier.tickets,
          repeatMonths: supplier.months.size,
          weightKg: supplier.weightKg,
          spend: supplier.spend,
          avgBuyPricePerKg: supplier.weightKg > 0 ? supplier.spend / supplier.weightKg : 0,
          estimatedMarginContribution,
          currency: supplier.currency,
        };
      })
      .sort((left, right) => right.weightKg - left.weightKg);

    const grossMargin = periodClosedSales.reduce((sum, sale) => sum + sale.totalAmount, 0) -
      periodPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
    const marginPerKg = periodClosedSales.reduce((sum, sale) => sum + sale.soldWeight, 0) > 0
      ? grossMargin / periodClosedSales.reduce((sum, sale) => sum + sale.soldWeight, 0)
      : 0;
    const marginPercent = periodClosedSales.reduce((sum, sale) => sum + sale.totalAmount, 0) > 0
      ? (grossMargin / periodClosedSales.reduce((sum, sale) => sum + sale.totalAmount, 0)) * 100
      : 0;

    const pendingApprovalAgesDays = pendingSales.map((sale) =>
      Math.max(0, (now.getTime() - new Date(sale.createdAt).getTime()) / MS_PER_DAY),
    );
    const averagePendingApprovalAgeDays = pendingApprovalAgesDays.length
      ? pendingApprovalAgesDays.reduce((sum, age) => sum + age, 0) / pendingApprovalAgesDays.length
      : 0;
    const maxPendingApprovalAgeDays = pendingApprovalAgesDays.length
      ? Math.max(...pendingApprovalAgesDays)
      : 0;

    const reconciliationVarianceByWeek = trendBuckets.map((bucket, index) => {
      const nextBucket = trendBuckets[index + 1];
      const weekSales = sales.filter(
        (sale) =>
          CLOSED_SALE_STATUSES.has(sale.status) &&
          sale.saleDate >= bucket &&
          (!nextBucket || sale.saleDate < nextBucket),
      );
      return {
        weekLabel: format(bucket, "yyyy-'W'II"),
        periodStart: bucket,
        varianceKg: weekSales.reduce((sum, sale) => sum + sale.soldWeight - sale.batch.totalWeight, 0),
        saleCount: weekSales.length,
      };
    });

    const snapshotGranularity = resolveSnapshotGranularity(windowMode);
    const snapshotSourceTimes = [
      ...periodPurchases.map((purchase) => purchase.purchaseDate.getTime()),
      ...periodClosedSales.map((sale) => sale.saleDate.getTime()),
    ];
    const snapshotRangeStart =
      windowStart ??
      (snapshotSourceTimes.length
        ? new Date(Math.min(...snapshotSourceTimes))
        : startOfMonth(windowEnd));
    const snapshotRangeEnd = windowEnd;
    const snapshotBuckets: Date[] = [];
    const bucketLimit = snapshotGranularity === "month" ? 240 : 400;
    let snapshotCursor = startOfGranularityBucket(snapshotRangeStart, snapshotGranularity);
    while (snapshotCursor.getTime() <= snapshotRangeEnd.getTime() && snapshotBuckets.length < bucketLimit) {
      snapshotBuckets.push(snapshotCursor);
      snapshotCursor = addGranularityBucket(snapshotCursor, snapshotGranularity);
    }
    if (snapshotBuckets.length === 0) {
      snapshotBuckets.push(startOfGranularityBucket(snapshotRangeEnd, snapshotGranularity));
    }

    const snapshotTrendMap = new Map<
      string,
      {
        label: string;
        purchaseWeight: number;
        saleWeight: number;
        purchaseValue: number;
        saleValue: number;
        margin: number;
        tickets: number;
        varianceKg: number;
        saleCount: number;
      }
    >(
      snapshotBuckets.map((bucket) => [
        bucket.toISOString(),
        {
          label: formatGranularityLabel(bucket, snapshotGranularity),
          purchaseWeight: 0,
          saleWeight: 0,
          purchaseValue: 0,
          saleValue: 0,
          margin: 0,
          tickets: 0,
          varianceKg: 0,
          saleCount: 0,
        },
      ]),
    );

    for (const purchase of periodPurchases) {
      const bucketKey = startOfGranularityBucket(purchase.purchaseDate, snapshotGranularity).toISOString();
      const bucket = snapshotTrendMap.get(bucketKey);
      if (!bucket) continue;
      bucket.purchaseWeight += purchase.weight;
      bucket.purchaseValue += purchase.totalAmount;
      bucket.tickets += 1;
      bucket.margin = bucket.saleValue - bucket.purchaseValue;
    }

    for (const sale of periodClosedSales) {
      const bucketKey = startOfGranularityBucket(sale.saleDate, snapshotGranularity).toISOString();
      const bucket = snapshotTrendMap.get(bucketKey);
      if (!bucket) continue;
      bucket.saleWeight += sale.soldWeight;
      bucket.saleValue += sale.totalAmount;
      bucket.tickets += 1;
      bucket.saleCount += 1;
      bucket.varianceKg += sale.soldWeight - sale.batch.totalWeight;
      bucket.margin = bucket.saleValue - bucket.purchaseValue;
    }

    const snapshotTrendRows = snapshotBuckets.map((bucket) => {
      const row = snapshotTrendMap.get(bucket.toISOString());
      return {
        label: formatGranularityLabel(bucket, snapshotGranularity),
        purchaseWeight: row?.purchaseWeight ?? 0,
        saleWeight: row?.saleWeight ?? 0,
        purchaseValue: row?.purchaseValue ?? 0,
        saleValue: row?.saleValue ?? 0,
        margin: row?.margin ?? 0,
        tickets: row?.tickets ?? 0,
        varianceKg: row?.varianceKg ?? 0,
        saleCount: row?.saleCount ?? 0,
      };
    });

    const currentBalanceTotal = balances.reduce((sum, balance) => sum + balance.balance, 0);
    const balanceEntryNetValue = balanceEntryNet._sum.amountDelta ?? 0;
    const balanceIntegrityDifference = currentBalanceTotal - balanceEntryNetValue;
    for (const sale of periodClosedSales) {
      const key = resolveMaterialLabel({
        materialName: sale.material?.name,
        materialCode: sale.material?.code,
        category: sale.batch.category,
      });
      const current =
        materialMap.get(key) ?? { label: key, purchaseWeight: 0, saleWeight: 0, purchaseValue: 0, saleValue: 0 };
      current.saleWeight += sale.soldWeight;
      current.saleValue += sale.totalAmount;
      materialMap.set(key, current);
    }

    const purchaseTotalsByEmployeeId = new Map(
      purchaseTotalsByEmployee.map((row) => [
        row.employeeId,
        {
          deliveredValue: row._sum.totalAmount ?? 0,
          deliveredWeight: row._sum.weight ?? 0,
          deliveryCount: row._count.id,
        },
      ]),
    );

    const balanceOperators = balances
      .filter((balance) => Math.abs(balance.balance) > 0.01)
      .map((balance) => {
        const delivered = purchaseTotalsByEmployeeId.get(balance.employee.id);
        return {
          id: balance.id,
          balance: balance.balance,
          employee: balance.employee,
          deliveredValue: delivered?.deliveredValue ?? 0,
          deliveredWeight: delivered?.deliveredWeight ?? 0,
          deliveryCount: delivered?.deliveryCount ?? 0,
        };
      })
      .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance));

    return successResponse({
      window: {
        mode: windowMode,
        label: describeWindow(windowMode),
        anchorDate: format(anchorDate, "yyyy-MM-dd"),
        startDate: windowStart ? format(windowStart, "yyyy-MM-dd") : null,
        endDate: format(windowEnd, "yyyy-MM-dd"),
      },
      summary: {
        purchasesThisMonthValue: periodPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
        purchasesThisMonthWeight: periodPurchases.reduce((sum, purchase) => sum + purchase.weight, 0),
        salesThisMonthValue: periodClosedSales.reduce((sum, sale) => sum + sale.totalAmount, 0),
        salesThisMonthWeight: periodClosedSales.reduce((sum, sale) => sum + sale.soldWeight, 0),
        estimatedMarginThisMonth:
          periodClosedSales.reduce((sum, sale) => sum + sale.totalAmount, 0) -
          periodPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
        readyBatchCount: readyBatches.length,
        collectingBatchCount: collectingBatches.length,
        pendingSalesCount: pendingSales.length,
        approvedSalesCount: approvedSales.length,
        activeMaterialsCount,
        materialsCount,
        operatorBalanceExposure: balances.reduce((sum, balance) => sum + balance.balance, 0),
        overdueSettlementAmount,
        yardStockWeight,
        yardStockValue,
        amountOwedToCompany,
        amountCompanyOwes,
        balanceCount: balanceOperators.length,
        averageBuyPricePerKg:
          periodPurchases.reduce((sum, purchase) => sum + purchase.weight, 0) > 0
            ? periodPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0) /
              periodPurchases.reduce((sum, purchase) => sum + purchase.weight, 0)
            : 0,
        ticketsProcessedToday: ticketsProcessedInWindow,
        ticketsProcessedPerHour,
        pendingSupplierPaymentsCount,
        pendingSupplierPaymentsAmount: pendingSupplierPaymentsTotals._sum.totalAmount ?? 0,
        heldInboundTicketsCount: heldPurchases.length,
        heldOutboundTicketsCount: heldSales.length,
        heldTicketsOldestAgeHours: heldTicketOldestAgeHours,
        weightedAverageCostPerKg:
          periodPurchases.reduce((sum, purchase) => sum + purchase.weight, 0) > 0
            ? periodPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0) /
              periodPurchases.reduce((sum, purchase) => sum + purchase.weight, 0)
            : 0,
        grossMargin,
        marginPerKg,
        marginPercent,
        completedSalesCount: completedSales.length,
        averagePendingApprovalAgeDays,
        maxPendingApprovalAgeDays,
        balanceEntryNet: balanceEntryNetValue,
        balanceIntegrityDifference,
      },
      snapshotTrend: {
        granularity: snapshotGranularity,
        rows: snapshotTrendRows,
      },
      yardStock: {
        totalWeight: yardStockWeight,
        totalValue: yardStockValue,
        materials: yardMaterials.slice(0, 8),
        trend: storageTrend,
        trendSeries: trendLabels,
      },
      balances: {
        amountOwedToCompany,
        amountCompanyOwes,
        operators: balanceOperators.slice(0, 8),
      },
      topMaterials: Array.from(materialMap.values())
        .sort((a, b) => b.saleValue - a.saleValue || b.purchaseValue - a.purchaseValue)
        .slice(0, 8),
      weightedAverageCostByMaterial,
      supplierPerformance: supplierPerformance.slice(0, 20),
      reconciliation: {
        varianceByWeek: reconciliationVarianceByWeek,
        balanceIntegrity: {
          currentBalanceTotal,
          balanceEntryNet: balanceEntryNetValue,
          difference: balanceIntegrityDifference,
        },
      },
      queues: {
        readyBatches: readyBatches.slice(0, 8),
        pendingSales: pendingSales.slice(0, 8),
        balances: balanceOperators.slice(0, 8),
        settlementBatches: settlementBatches
          .map((batch) => ({
            id: batch.id,
            label: batch.label,
            dueDate: batch.dueDate,
            workflowStatus: batch.workflowStatus,
            totalAmount: batch.items.reduce((sum, item) => sum + item.amount, 0),
          }))
          .slice(0, 8),
        overduePayments: overduePayments.slice(0, 8),
        pendingSupplierPayments,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/dashboard error:", error);
    return errorResponse("Failed to load scrap dashboard");
  }
}
