import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
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
      customerId: string | null;
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
        customerId: null,
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

  const customerNames = [...buckets.values()].map((entry) => entry.customerName);
  if (customerNames.length > 0) {
    const customers = await prisma.customer.findMany({
      where: {
        companyId: session.user.companyId,
        isActive: true,
        name: { in: customerNames },
      },
      select: { id: true, name: true },
    });
    const customerMap = new Map(customers.map((customer) => [customer.name.toLowerCase(), customer.id]));
    for (const [key, value] of buckets.entries()) {
      value.customerId = customerMap.get(key) ?? null;
    }
  }

  const data = [...buckets.values()]
    .map((row) => {
      const loyaltyPoints = Math.max(Math.floor(row.totalSpend), 0);
      return {
        customerId: row.customerId,
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

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const input = createCustomerSchema.parse(body);

    const created = await prisma.customer.create({
      data: {
        companyId: session.user.companyId,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });
    return successResponse({ data: created }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse("Failed to create customer", 500);
  }
}
