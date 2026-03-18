import { NextRequest, NextResponse } from "next/server";
import { startOfMonth, subDays } from "date-fns";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "./_helpers";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const companyId = session.user.companyId;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = subDays(now, 6);

  const [
    sales,
    receipts,
    openShifts,
    catalogItems,
    promotions,
    purchaseOrders,
    inventoryItems,
    recentSales,
  ] = await Promise.all([
    prisma.retailSale.findMany({
      where: {
        companyId,
        postedAt: { gte: monthStart },
      },
      include: {
        payments: true,
        lines: true,
      },
      orderBy: { postedAt: "desc" },
    }),
    prisma.retailGoodsReceipt.findMany({
      where: { companyId, createdAt: { gte: monthStart } },
      include: { lines: true },
    }),
    prisma.retailShift.findMany({
      where: { companyId, status: "OPEN" },
      orderBy: { openedAt: "asc" },
      take: 8,
    }),
    prisma.retailCatalogItem.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.retailPromotion.findMany({
      where: { companyId, status: "ACTIVE" },
    }),
    prisma.retailPurchaseOrder.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "APPROVED", "PARTIAL"] },
      },
      include: { lines: true },
    }),
    prisma.inventoryItem.findMany({
      where: { site: { companyId } },
      orderBy: { currentStock: "asc" },
      take: 200,
    }),
    prisma.retailSale.findMany({
      where: { companyId },
      include: { payments: true, lines: true },
      orderBy: { postedAt: "desc" },
      take: 10,
    }),
  ]);

  const retailInventoryIds = new Set(catalogItems.map((item) => item.inventoryItemId));
  const retailInventory = inventoryItems.filter((item) => retailInventoryIds.has(item.id));
  const lowStock = retailInventory.filter(
    (item) => item.minStock !== null && item.currentStock <= (item.minStock ?? 0),
  );

  const postedSales = sales.filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED");
  const refunds = sales.filter((sale) => sale.saleType === "REFUND" && sale.status === "POSTED");
  const voids = sales.filter((sale) => sale.saleType === "VOID" && sale.status === "POSTED");
  const grossSales = sum(postedSales.map((sale) => sale.totalAmount));
  const netSales = sum(sales.map((sale) => sale.totalAmount));
  const refundValue = Math.abs(sum(refunds.map((sale) => sale.totalAmount)));
  const voidValue = Math.abs(sum(voids.map((sale) => sale.totalAmount)));
  const discountValue = sum(postedSales.map((sale) => sale.discountAmount));
  const taxValue = sum(postedSales.map((sale) => sale.taxAmount));
  const goodsReceivedValue = sum(
    receipts.flatMap((receipt) => receipt.lines).map((line) => line.lineTotal),
  );
  const openOrderValue = sum(
    purchaseOrders.flatMap((order) => order.lines).map((line) => line.lineTotal),
  );

  const tenderTotals = sales.flatMap((sale) => sale.payments).reduce<Record<string, number>>(
    (accumulator, payment) => {
      accumulator[payment.tenderType] = (accumulator[payment.tenderType] ?? 0) + payment.amount;
      return accumulator;
    },
    {},
  );

  const salesTrend = Array.from({ length: 7 }).map((_, index) => {
    const day = subDays(now, 6 - index);
    const key = day.toISOString().slice(0, 10);
    const daySales = sales.filter(
      (sale) => (sale.postedAt ?? sale.createdAt).toISOString().slice(0, 10) === key,
    );
    return {
      id: key,
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      sales: sum(daySales.map((sale) => sale.totalAmount)),
      tickets: daySales.length,
    };
  });

  const topItems = recentSales
    .flatMap((sale) => sale.lines)
    .reduce<Record<string, { itemName: string; quantity: number; value: number }>>(
      (accumulator, line) => {
        const bucket = accumulator[line.itemName] ?? {
          itemName: line.itemName,
          quantity: 0,
          value: 0,
        };
        bucket.quantity += line.quantity;
        bucket.value += line.lineTotal;
        accumulator[line.itemName] = bucket;
        return accumulator;
      },
      {},
    );

  const dailySales = sales.filter((sale) => (sale.postedAt ?? sale.createdAt) >= sevenDaysAgo);

  return successResponse({
    summary: {
      grossSales,
      netSales,
      refundValue,
      voidValue,
      discountValue,
      taxValue,
      goodsReceivedValue,
      openOrderValue,
      activeCatalogCount: catalogItems.length,
      activePromotionCount: promotions.length,
      openShiftCount: openShifts.length,
      lowStockCount: lowStock.length,
      ticketCount: postedSales.length,
      averageTicket: postedSales.length > 0 ? sum(postedSales.map((sale) => sale.totalAmount)) / postedSales.length : 0,
      sevenDaySales: sum(dailySales.map((sale) => sale.totalAmount)),
    },
    salesTrend,
    tenderMix: Object.entries(tenderTotals).map(([tenderType, amount]) => ({
      tenderType,
      amount,
    })),
    topItems: Object.values(topItems)
      .sort((left, right) => right.value - left.value)
      .slice(0, 8),
    openShifts: openShifts.map((shift) => ({
      id: shift.id,
      shiftNo: shift.shiftNo,
      registerName: shift.registerName,
      siteId: shift.siteId,
      cashierName: shift.cashierName,
      openedAt: shift.openedAt,
      expectedCash: shift.expectedCash,
      openingFloat: shift.openingFloat,
    })),
    lowStock: lowStock.slice(0, 10).map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      currentStock: item.currentStock,
      minStock: item.minStock ?? 0,
      unit: item.unit,
    })),
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      saleNo: sale.saleNo,
      saleType: sale.saleType,
      status: sale.status,
      postedAt: sale.postedAt ?? sale.createdAt,
      cashierName: sale.cashierName,
      totalAmount: sale.totalAmount,
      itemCount: sale.lines.reduce((total, line) => total + line.quantity, 0),
      tenderTypes: sale.payments.map((payment) => payment.tenderType),
    })),
  });
}
