import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { money, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery, retailOffsetQuery, slicePage } from "@/lib/retail/request";
import { requireRetailSession } from "../_helpers";

/**
 * R-3.1/R-3.2. The list is an aggregate over sales, not a table.
 *
 * So it pages by offset rather than by cursor: there is no row id to cursor on,
 * because the rows do not exist until this handler has built them. `scanLimit`
 * is the window it aggregates over, and it is reported back — a shop looking at
 * page four should be able to tell whether it is seeing the tail of the list or
 * the edge of the scan.
 */
const customerListQuery = retailOffsetQuery.extend({
  search: z.string().trim().max(120).optional(),
  scanLimit: z.coerce.number().int().min(100).max(20_000).optional(),
});

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

  // R-2.3. The customer list is a selling tool: loyalty is applied mid-sale, so
  // a cashier needs it. A stock clerk does not — knowing who shops here is not
  // part of counting what is on the shelf.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, customerListQuery);
  if (query.response) return query.response;
  const search = query.data.search?.toLowerCase() ?? "";
  const scanLimit = query.data.scanLimit ?? 2_500;

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
    take: scanLimit,
  });

  /*
    R-1.1, arriving late.

    `totalSpend` was a `number` accumulated with `+=` and rendered with
    `Number(x.toFixed(2))` — the exact helper R-1.1 deleted from `_helpers.ts`,
    reintroduced here where nobody looked. A regular's spend is a sum of
    hundreds of receipts, which is where float drift shows first, and it feeds
    `loyaltyPoints` and therefore the tier the counter offers them.

    `Prisma.Decimal` throughout; it becomes a number once, on the way out.
  */
  const buckets = new Map<
    string,
    {
      customerId: string | null;
      customerName: string;
      visits: number;
      amounts: Prisma.Decimal[];
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
    // A reversal already carries a negative `totalAmount`, so netting is a sum.
    const netDelta = money(sale.totalAmount);
    if (!current) {
      buckets.set(key, {
        customerId: null,
        customerName: name,
        visits: sale.saleType === "SALE" ? 1 : 0,
        amounts: [netDelta],
        lastPurchaseAt: postedAt,
        lastSaleNo: sale.saleNo,
      });
      continue;
    }
    current.amounts.push(netDelta);
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

  const all = [...buckets.values()]
    .map((row) => {
      const totalSpend = sumMoney(row.amounts);
      // A point per whole dollar netted. Floored on the Decimal, so a customer
      // sitting on 499.995 does not round into SILVER on a rendering artefact.
      const loyaltyPoints = Math.max(Number(totalSpend.floor()), 0);
      return {
        customerId: row.customerId,
        customerName: row.customerName,
        visits: row.visits,
        totalSpend: toNumberOrZero(totalSpend),
        lastPurchaseAt: row.lastPurchaseAt,
        lastSaleNo: row.lastSaleNo,
        loyaltyPoints,
        loyaltyTier: getLoyaltyTier(loyaltyPoints),
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const page = slicePage(all, query.data, 100);

  return successResponse({
    data: page.rows,
    page: {
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      hasMore: page.hasMore,
      // What the aggregate was built from. `scanned === scanLimit` means the
      // window is full and there may be older custom this list has not seen.
      scanned: sales.length,
      scanLimit,
    },
    summary: {
      // Across every customer found, not just this page — the count of a shop's
      // regulars should not change when somebody turns to page two.
      namedCustomerCount: all.length,
      totalLoyaltyPoints: all.reduce((sum, row) => sum + row.loyaltyPoints, 0),
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

  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = createCustomerSchema.parse(body);
    const normalizedName = input.name.trim();
    const normalizedPhone = input.phone?.trim() || null;
    const normalizedEmail = input.email?.trim().toLowerCase() || null;

    const existing = await prisma.customer.findFirst({
      where: {
        companyId: session.user.companyId,
        isActive: true,
        OR: [
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          { name: { equals: normalizedName, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (existing) {
      const updated = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...(existing.name !== normalizedName ? { name: normalizedName } : {}),
          ...(normalizedPhone && existing.phone !== normalizedPhone ? { phone: normalizedPhone } : {}),
          ...(normalizedEmail && existing.email !== normalizedEmail ? { email: normalizedEmail } : {}),
        },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      });
      return successResponse({ data: updated });
    }

    const created = await prisma.customer.create({
      data: {
        companyId: session.user.companyId,
        name: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail,
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
