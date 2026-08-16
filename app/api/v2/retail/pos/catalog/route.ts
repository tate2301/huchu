import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { loadShelfListings } from "@/lib/retail/shelf-listing";
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
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const siteId = searchParams.get("siteId")?.trim();
  const category = searchParams.get("category")?.trim();

  const listings = await loadShelfListings(session.user.companyId, {
    siteId: siteId || null,
    search: search || null,
    category: category || null,
    activeOnly: true,
    take: 120,
  });

  return successResponse({
    data: listings.filter((item) => (item.inventoryItem?.currentStock ?? 0) > 0),
  });
}
