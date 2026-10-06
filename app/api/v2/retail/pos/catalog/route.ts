import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { successResponse } from "@/lib/api-response";
import { depositKindName, loadDepositKinds } from "@/lib/retail/deposit-kinds";
import { wasPrices } from "@/lib/retail/prices/was";
import { loadShelfListings, mostSoldProductIds } from "@/lib/retail/shelf-listing";
import { requirePosDevice, shopSiteId } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { loadShopProfile, shopFeatures } from "@/lib/retail/shop-profile";
import { requireRetailSession } from "../../_helpers";
import { tillCaseLinks, type CaseLinks } from "../_cases";

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
 *
 * The shelf is the one at the branch this till stands in. Price check also
 * reads it on a device that is not a till yet (W-04 step 5), which gets the
 * shop's default branch instead. On a shop that sells
 * cases and singles, each line also says which case can be opened for it
 * (`openableCase`) and, for a case, which single it holds (`caseOf`).
 *
 * The order is "Most sold", the till's first group: units on posted sales at
 * this branch over the last 30 days, most first, then everything unsold by
 * name. A category or a search keeps the same order inside what it narrows to.
 */
/**
 * R-3.1. The till sends two filters and nothing else; the device fixes the site.
 *
 * No `limit`: the 120 below is the offline snapshot's size, decided here rather
 * than by the caller, because the till caches whatever comes back and a cashier
 * asking for 5,000 rows over a shop's connection is not a request worth
 * honouring.
 */
const tillCatalogQuery = z.object({
  search: z.string().trim().max(200).optional(),
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

  const companyId = session.user.companyId;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  const siteId = device ? device.register.site.id : await shopSiteId(companyId);
  if (!siteId) return deviceResponse as NextResponse;
  const mostSold = await mostSoldProductIds(companyId, siteId);
  const [listings, profile, depositKinds] = await Promise.all([
    loadShelfListings(companyId, {
      siteId,
      search: query.data.search || null,
      category: query.data.category || null,
      activeOnly: true,
      take: 120,
      firstIds: mostSold,
    }),
    loadShopProfile(companyId),
    loadDepositKinds(companyId),
  ]);
  const links: CaseLinks = shopFeatures(profile).casesAndSingles
    ? await tillCaseLinks(companyId, siteId, listings.map((item) => item.productId))
    : new Map();

  // A single with an empty shelf still shows while a case can be opened for it.
  const selling = listings
    .map((item) => ({
      ...item,
      openableCase: links.get(item.productId)?.openableCase ?? null,
      caseOf: links.get(item.productId)?.caseOf ?? null,
      // What the shop calls its deposit ("Bottles, 340 to 375ml"); null when unnamed or none.
      depositName: item.returnable ? depositKindName(depositKinds, item.depositAmount) : null,
    }))
    .filter((item) => (item.inventoryItem?.currentStock ?? 0) > 0 || (item.openableCase?.casesOnHand ?? 0) > 0);
  // The till strikes through a recent cut: the price before it, from the history.
  const was = await wasPrices(companyId, new Map(selling.map((item) => [item.id, item.unitPrice])));
  return successResponse({
    data: selling.map((item) => ({ ...item, wasPrice: was.get(item.id) ?? null })),
  });
}
