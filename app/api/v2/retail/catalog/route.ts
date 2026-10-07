import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { successResponse } from "@/lib/api-response";
import { loadShelfListings } from "@/lib/retail/shelf-listing";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../_helpers";

/**
 * The back-office range.
 *
 * S-4b — `Product` + `InventoryItem`, not `RetailCatalogItem`. The wire shape is
 * the one the catalogue and pricing screens already read, minus two fields that
 * had no meaning once the item master moved: `catalogCode`, which `Product.code`
 * subsumes (it was a second identifier for the same line, reserved from a
 * sequence and shown beside the SKU it duplicated), and `acquisitionMode`, a
 * single-valued enum nothing has ever written anything but `PURCHASE` to.
 */
/**
 * R-3.1. What the range list accepts.
 *
 * `status` took a hand-written three-way comparison, and `"all"` was accepted
 * as a synonym for absent — kept, because the catalogue screen sends it.
 *
 * R-3.2. `limit` is new, and so is the fact that there is one. This read was
 * the unbounded one: `loadShelfListings` with no `take`, one price resolution
 * per row, and a shop that ranges 4,000 lines got all 4,000 on every keystroke
 * of the search box. The cap is generous because a shopkeeper scrolling their
 * own range is the normal case and paging it would be a worse screen.
 */
const catalogQuery = z.object({
  search: z.string().trim().max(200).optional(),
  siteId: z.string().uuid().optional(),
  status: z.enum(["all", "ACTIVE", "INACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(2_000).optional(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. A cashier reads the range — a till that cannot list its stock cannot
  // sell — and a stock clerk reads it to count against. Nobody else does.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, catalogQuery);
  if (query.response) return query.response;

  const data = await loadShelfListings(session.user.companyId, {
    siteId: query.data.siteId ?? null,
    search: query.data.search || null,
    status: query.data.status === "all" ? null : (query.data.status ?? null),
    take: query.data.limit ?? 1_000,
  });

  return successResponse({ data });
}
