import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getCustomerLoyaltyBalance } from "@/lib/retail/loyalty";
import { requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "10"), 1), 30);
  if (!q) return successResponse({ data: [] });

  const customers = await prisma.customer.findMany({
    where: {
      companyId: session.user.companyId,
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      updatedAt: true,
    },
  });

  const data = [];
  for (const customer of customers) {
    const loyalty = await getCustomerLoyaltyBalance({
      companyId: session.user.companyId,
      customerName: customer.name,
    });
    data.push({
      ...customer,
      loyaltyPoints: loyalty.balance,
      loyaltyTier: loyalty.tier,
    });
  }

  return successResponse({ data });
}
