import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { successResponse } from "@/lib/api-response";
import { loadShelfListings } from "@/lib/retail/shelf-listing";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../_helpers";

/**
 * The till's shelf.
 *
 * S-4b — read out of `Product` + `InventoryItem`. S-3's contract is unchanged:
 * this is the till's **offline snapshot**, so what ships is still flat numbers
 * plus the stamp saying which list they came off and when.
 * `lib/retail/offline-bootstrap.ts` caches whatever comes back here and the till
 * then reads it literally, with no price list in sight.
 *
 * `id` is a `Product.id` now, where it used to be a `RetailCatalogItem.id`. That
 * is the identity the cart, the sale line and the sync payload all carry.
 */
/**
 * R-3.1. The till sends three filters and nothing else.
 *
 * No `limit`: the 120 below is the offline snapshot's size, decided here rather
 * than by the caller, because the till caches whatever comes back and a cashier
 * asking for 5,000 rows over a shop's connection is not a request worth
 * honouring.
 */
const tillCatalogQuery = z.object({
  search: z.string().trim().max(200).optional(),
  siteId: z.string().uuid().optional(),
  category: z.string().trim().max(120).optional(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Open to a cashier on purpose, and this is the case the matrix was
  // built for: `view` without `view-cost`. What ships below is shelf price and
  // tax only — the buying price is the owner's business and never leaves here.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, tillCatalogQuery);
  if (query.response) return query.response;

  const listings = await loadShelfListings(session.user.companyId, {
    siteId: query.data.siteId ?? null,
    search: query.data.search || null,
    category: query.data.category || null,
    activeOnly: true,
    take: 120,
  });

  return successResponse({
    data: listings.filter((item) => (item.inventoryItem?.currentStock ?? 0) > 0),
  });
}
