import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../_helpers";

function getLoyaltyTier(points: number) {
  if (points >= 2_000) return "GOLD";
  if (points >= 500) return "SILVER";
  return "BRONZE";
}

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";

  const sales = await prisma.retailSale.findMany({
    where: {
      companyId: session.user.companyId,
      status: "POSTED",
      customerName: { not: null },
    },
    select: {
      saleNo: true,
      saleType: true,
      customerName: true,
      totalAmount: true,
      postedAt: true,
      createdAt: true,
    },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: 2_500,
  });

  const buckets = new Map<
    string,
    {
      customerName: string;
      visits: number;
      totalSpend: number;
      lastPurchaseAt: Date;
      lastSaleNo: string;
    }
  >();

  for (const sale of sales) {
    const name = sale.customerName?.trim() ?? "";
    if (!name || name.toLowerCase() === "walk-in") continue;
    const key = name.toLowerCase();
    if (search && !key.includes(search)) continue;

    const postedAt = sale.postedAt ?? sale.createdAt;
    const current = buckets.get(key);
    const netDelta = sale.totalAmount;
    if (!current) {
      buckets.set(key, {
        customerName: name,
        visits: sale.saleType === "SALE" ? 1 : 0,
        totalSpend: netDelta,
        lastPurchaseAt: postedAt,
        lastSaleNo: sale.saleNo,
      });
      continue;
    }
    current.totalSpend += netDelta;
    if (sale.saleType === "SALE") {
      current.visits += 1;
    }
    if (postedAt.getTime() > current.lastPurchaseAt.getTime()) {
      current.lastPurchaseAt = postedAt;
      current.lastSaleNo = sale.saleNo;
    }
  }

  const data = [...buckets.values()]
    .map((row) => {
      const loyaltyPoints = Math.max(Math.floor(row.totalSpend), 0);
      return {
        customerName: row.customerName,
        visits: row.visits,
        totalSpend: Number(row.totalSpend.toFixed(2)),
        lastPurchaseAt: row.lastPurchaseAt,
        lastSaleNo: row.lastSaleNo,
        loyaltyPoints,
        loyaltyTier: getLoyaltyTier(loyaltyPoints),
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return successResponse({
    data,
    summary: {
      namedCustomerCount: data.length,
      totalLoyaltyPoints: data.reduce((sum, row) => sum + row.loyaltyPoints, 0),
    },
  });
}
