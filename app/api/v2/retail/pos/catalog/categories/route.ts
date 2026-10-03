import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/**
 * The category chips above the till's shelf.
 *
 * The shop's own categories (Products › Categories), in the shop's order, that
 * have something on sale at this branch. It used to be the distinct
 * `InventoryItem.category` values — the stores module's FUEL / SPARES /
 * CONSUMABLES, which is how a bottle store's till came to offer "Consumables".
 */
/** R-3.1. One optional branch. */
const categoriesQuery = z.object({ siteId: z.string().uuid().optional() });

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Names only, but it is the range, so it answers to the range's gate.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, categoriesQuery);
  if (query.response) return query.response;

  const rows = await prisma.retailCategory.findMany({
    where: {
      companyId: session.user.companyId,
      archivedAt: null,
      products: {
        some: {
          companyId: session.user.companyId,
          isActive: true,
          archivedAt: null,
          ...(query.data.siteId ? { inventoryItems: { some: { siteId: query.data.siteId } } } : {}),
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true },
  });

  return successResponse({ data: rows.map((row) => row.name) });
}
