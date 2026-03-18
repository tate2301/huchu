import { NextRequest, NextResponse } from "next/server";
import { startOfMonth } from "date-fns";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const monthStart = startOfMonth(new Date());

    const [
      purchases,
      sales,
      batches,
      materialsCount,
      activeMaterialsCount,
      balances,
      settlementBatches,
      overduePayments,
    ] = await Promise.all([
      prisma.scrapMetalPurchase.findMany({
        where: { companyId },
        select: {
          id: true,
          purchaseDate: true,
          totalAmount: true,
          weight: true,
          category: true,
          status: true,
          material: { select: { id: true, name: true } },
        },
        orderBy: [{ purchaseDate: "desc" }],
        take: 250,
      }),
      prisma.scrapMetalSale.findMany({
        where: { companyId },
        select: {
          id: true,
          saleDate: true,
          totalAmount: true,
          soldWeight: true,
          status: true,
          buyerName: true,
          batch: { select: { batchNumber: true, category: true } },
          material: { select: { id: true, name: true } },
        },
        orderBy: [{ saleDate: "desc" }],
        take: 250,
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
    ]);

    const monthPurchases = purchases.filter((purchase) => purchase.purchaseDate >= monthStart);
    const monthSales = sales.filter((sale) => sale.saleDate >= monthStart);
    const readyBatches = batches.filter((batch) => batch.status === "READY");
    const collectingBatches = batches.filter((batch) => batch.status === "COLLECTING");
    const pendingSales = sales.filter((sale) => sale.status === "PENDING_APPROVAL");
    const approvedSales = sales.filter((sale) => sale.status === "APPROVED");
    const overdueSettlementAmount = overduePayments.reduce(
      (sum, payment) => sum + (payment.amountUsd ?? payment.amount ?? 0),
      0,
    );

    const materialMap = new Map<
      string,
      { label: string; purchaseWeight: number; saleWeight: number; purchaseValue: number; saleValue: number }
    >();
    for (const purchase of purchases) {
      const key = purchase.material?.name ?? purchase.category;
      const current =
        materialMap.get(key) ?? { label: key, purchaseWeight: 0, saleWeight: 0, purchaseValue: 0, saleValue: 0 };
      current.purchaseWeight += purchase.weight;
      current.purchaseValue += purchase.totalAmount;
      materialMap.set(key, current);
    }
    for (const sale of sales) {
      const key = sale.material?.name ?? sale.batch.category;
      const current =
        materialMap.get(key) ?? { label: key, purchaseWeight: 0, saleWeight: 0, purchaseValue: 0, saleValue: 0 };
      current.saleWeight += sale.soldWeight;
      current.saleValue += sale.totalAmount;
      materialMap.set(key, current);
    }

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
      },
      topMaterials: Array.from(materialMap.values())
        .sort((a, b) => b.saleValue - a.saleValue || b.purchaseValue - a.purchaseValue)
        .slice(0, 8),
      queues: {
        readyBatches: readyBatches.slice(0, 8),
        pendingSales: pendingSales.slice(0, 8),
        balances: balances.slice(0, 8),
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
      },
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/dashboard error:", error);
    return errorResponse("Failed to load scrap dashboard");
  }
}
