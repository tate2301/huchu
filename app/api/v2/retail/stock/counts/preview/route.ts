import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { countPreviewInput, previewCount } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../_helpers";

/**
 * How many products a count would cover (30-stock 4.4): the sheet's
 * "61 products." `?siteId=&scope=&categoryIds=a,b&lineIds=&placeId=` →
 * `{ products }`. `retail.counts:create`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.counts", "create");
  if (gate) return gate;

  const query = request.nextUrl.searchParams;
  const list = (key: string) => {
    const value = query.get(key);
    return value ? value.split(",").filter(Boolean) : undefined;
  };
  const parsed = countPreviewInput.safeParse({
    siteId: query.get("siteId") || undefined,
    scope: query.get("scope") ?? undefined,
    categoryIds: list("categoryIds"),
    lineIds: list("lineIds"),
    placeId: query.get("placeId") || undefined,
  });
  if (!parsed.success) return errorResponse("Say what to count.", 400);

  try {
    return successResponse(await previewCount(session.user.companyId, parsed.data));
  } catch (error) {
    console.error("[API] GET /api/v2/retail/stock/counts/preview error:", error);
    return errorResponse("That could not be counted up. Try again.");
  }
}
