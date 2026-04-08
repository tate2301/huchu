import { NextRequest, NextResponse } from "next/server";
import { format, startOfMonth, startOfWeek, subWeeks } from "date-fns";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const STORAGE_TREND_WEEKS = 12;
const MATERIAL_LIMIT = 6;
const CLOSED_SALE_STATUSES = new Set(["APPROVED", "COMPLETED"]);
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const trendStart = startOfWeek(subWeeks(now, STORAGE_TREND_WEEKS - 1), {
      weekStartsOn: 1,
    });
    const trendBuckets = Array.from({ length: STORAGE_TREND_WEEKS }, (_, index) =>
      startOfWeek(subWeeks(now, STORAGE_TREND_WEEKS - 1 - index), {
        weekStartsOn: 1,
      }),
    );
    const trendBucketKeys = trendBuckets.map((bucket) => bucket.toISOString());

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
          purchaseDate: {
            gte: trendStart,
          },
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
          saleDate: {
            gte: trendStart,
          },
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
        },
      }),
      prisma.scrapMetalPurchase.aggregate({
        where: {
          companyId,
          status: "POSTED",
          purchasePaymentId: null,
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
    const monthPurchases = purchases.filter((purchase) => purchase.purchaseDate >= monthStart);
    const monthSales = sales.filter(
      (sale) => sale.saleDate >= monthStart && CLOSED_SALE_STATUSES.has(sale.status),
    );
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayPurchases = purchases.filter((purchase) => purchase.purchaseDate >= todayStart);
    const todaySales = sales.filter((sale) => sale.saleDate >= todayStart && CLOSED_SALE_STATUSES.has(sale.status));
    const elapsedHoursToday = Math.max((now.getTime() - todayStart.getTime()) / MS_PER_HOUR, 1 / 60);
    const ticketsProcessedToday = todayPurchases.length + todaySales.length;
    const ticketsProcessedPerHour = ticketsProcessedToday / elapsedHoursToday;
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
    const pendingSales = sales.filter((sale) => sale.status === "PENDING_APPROVAL");
    const approvedSales = sales.filter((sale) => sale.status === "APPROVED");
    const completedSales = sales.filter((sale) => sale.status === "COMPLETED");
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
    for (const purchase of purchases) {
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
    for (const purchase of monthPurchases) {
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
    for (const sale of monthSales) {
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
        const supplierPurchases = monthPurchases.filter(
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

    const grossMargin = monthSales.reduce((sum, sale) => sum + sale.totalAmount, 0) -
      monthPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
    const marginPerKg = monthSales.reduce((sum, sale) => sum + sale.soldWeight, 0) > 0
      ? grossMargin / monthSales.reduce((sum, sale) => sum + sale.soldWeight, 0)
      : 0;
    const marginPercent = monthSales.reduce((sum, sale) => sum + sale.totalAmount, 0) > 0
      ? (grossMargin / monthSales.reduce((sum, sale) => sum + sale.totalAmount, 0)) * 100
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

    const currentBalanceTotal = balances.reduce((sum, balance) => sum + balance.balance, 0);
    const balanceEntryNetValue = balanceEntryNet._sum.amountDelta ?? 0;
    const balanceIntegrityDifference = currentBalanceTotal - balanceEntryNetValue;
    for (const sale of sales) {
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
      summary: {
        purchasesThisMonthValue: monthPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
        purchasesThisMonthWeight: monthPurchases.reduce((sum, purchase) => sum + purchase.weight, 0),
        salesThisMonthValue: monthSales.reduce((sum, sale) => sum + sale.totalAmount, 0),
        salesThisMonthWeight: monthSales.reduce((sum, sale) => sum + sale.soldWeight, 0),
        estimatedMarginThisMonth:
          monthSales.reduce((sum, sale) => sum + sale.totalAmount, 0) -
          monthPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
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
          monthPurchases.reduce((sum, purchase) => sum + purchase.weight, 0) > 0
            ? monthPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0) /
              monthPurchases.reduce((sum, purchase) => sum + purchase.weight, 0)
            : 0,
        ticketsProcessedToday,
        ticketsProcessedPerHour,
        pendingSupplierPaymentsCount,
        pendingSupplierPaymentsAmount: pendingSupplierPaymentsTotals._sum.totalAmount ?? 0,
        heldInboundTicketsCount: heldPurchases.length,
        heldOutboundTicketsCount: heldSales.length,
        heldTicketsOldestAgeHours: heldTicketOldestAgeHours,
        weightedAverageCostPerKg:
          monthPurchases.reduce((sum, purchase) => sum + purchase.weight, 0) > 0
            ? monthPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0) /
              monthPurchases.reduce((sum, purchase) => sum + purchase.weight, 0)
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
