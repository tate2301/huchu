import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getCustomerLoyaltyBalance } from "@/lib/retail/loyalty";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../_helpers";

/**
 * R-3.1. The lookup the counter runs mid-sale.
 *
 * The hand-rolled version was
 * `Math.min(Math.max(Number(searchParams.get("limit") ?? "10"), 1), 30)`, which
 * turns `limit=abc` into `NaN` and hands Prisma `take: NaN`.
 */
const customerSearchQuery = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. The lookup the counter runs mid-sale. Same gate as the list it
  // searches, because it is the same data reached a faster way.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, customerSearchQuery);
  if (query.response) return query.response;

  const q = query.data.q ?? "";
  const limit = query.data.limit ?? 10;
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
