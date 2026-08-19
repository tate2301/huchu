import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { multiplyMoney, quantity, sumMoney, toNumberOrZero, ZERO } from "@/lib/money";

/**
 * Where stock is kept, and what is in each place.
 *
 * "Stock on hand" answers how much of a thing exists across the business.
 * This answers the other question — what is in this store — which the same
 * page cannot do without becoming a pivot table. Counts and value are summed
 * here rather than in the browser so a tenant with thousands of items does
 * not download all of them to add up four numbers.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    const locations = await prisma.stockLocation.findMany({
      where: {
        site: { companyId },
        ...(siteId ? { siteId } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        site: { select: { id: true, name: true, code: true } },
        items: {
          select: { id: true, currentStock: true, unitCost: true, minStock: true },
        },
      },
      orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
    });

    const rows = locations.map((location) => {
      let value = 0;
      let low = 0;
      let holding = 0;
      /*
        S-1. `value` was `+= currentStock * unitCost` on two doubles, summed
        across every line in a store, and it is rendered as "what is sitting in
        this store" — a figure an owner reads as money. Both operands are
        `Decimal` now and the multiply-then-sum happens in Decimal.
      */
      const values: Prisma.Decimal[] = [];
      for (const item of location.items) {
        // An item with no cost recorded contributes nothing rather than
        // silently valuing at zero — the difference matters when the total is
        // read as "what is sitting in this store".
        if (item.unitCost !== null) values.push(multiplyMoney(item.currentStock, item.unitCost));
        if (quantity(item.currentStock).greaterThan(ZERO)) holding += 1;
        if (
          item.minStock !== null &&
          !quantity(item.currentStock).greaterThan(quantity(item.minStock))
        ) {
          low += 1;
        }
      }
      value = toNumberOrZero(sumMoney(values));
      return {
        id: location.id,
        code: location.code,
        name: location.name,
        isActive: location.isActive,
        site: location.site,
        itemCount: location.items.length,
        holdingCount: holding,
        lowCount: low,
        stockValue: Math.round(value * 100) / 100,
        /** Whether every item here has a cost, so the value can be trusted. */
        valueComplete: location.items.every((item) => item.unitCost !== null),
      };
    });

    return successResponse({ data: rows });
  } catch (error) {
    console.error("[API] GET /api/v2/inventory/locations error:", error);
    return errorResponse("Failed to fetch stock locations");
  }
}
