import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { applyDuePriceChanges } from "@/lib/retail/prices/change";
import { loadPricingSnapshot } from "@/lib/retail/pricing/snapshot";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../_helpers";

const pricingQuery = z.object({
  siteId: z.string().uuid().optional(),
  registerId: z.string().uuid().optional(),
});

/**
 * The till's price snapshot (PRD-05, 20-products 4.4; FLR-10 polls it, D-2):
 * the lists that are on with their rules, and their prices for the products
 * stocked at the site, for the engine the till runs offline. Scheduled price
 * changes that have come due are applied first. `ETag` is the snapshot's
 * version; a till sending it back in `If-None-Match` gets 304 while nothing
 * changed. `retail.sell:view`, as `pos/catalog`; a paired till's own site and
 * till win over the query.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, pricingQuery);
  if (query.response) return query.response;

  const companyId = session.user.companyId;
  const { device } = await requirePosDevice(request, session);
  await applyDuePriceChanges(companyId);
  const snapshot = await loadPricingSnapshot(companyId, {
    siteId: device ? device.register.site.id : (query.data.siteId ?? null),
    registerId: device ? device.registerId : (query.data.registerId ?? null),
  });

  const etag = `"${snapshot.version}"`;
  const asked = (request.headers.get("if-none-match") ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""));
  if (asked.includes(etag) || asked.includes(snapshot.version)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  const answer = successResponse(snapshot);
  answer.headers.set("ETag", etag);
  answer.headers.set("Cache-Control", "no-cache");
  return answer;
}
