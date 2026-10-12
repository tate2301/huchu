import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { suggestFor } from "@/lib/retail/buying/suggest";
import { defaultSiteFor } from "@/lib/retail/floor/default-site";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** `[id]` is the supplier, or `auto` with `productIds`: the supplier most of those products name. */
const paramsSchema = z.object({ id: z.union([z.string().uuid(), z.literal("auto")]) });

/**
 * The New order sheet's lines (W-30 "Suggested lines"), its expected day and
 * how the order goes, for a supplier at a site (default: the caller's).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.purchasing", "create")) return errorResponse("Your role cannot create purchase orders", 403);
  const path = await parseRetailParams(params, paramsSchema);
  if (path.response) return path.response;
  const search = request.nextUrl.searchParams;
  const companyId = session.user.companyId;
  const idsOf = (key: string) =>
    (search.get(key) ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => z.string().uuid().safeParse(id).success);
  // On hand's ticked stock lines (`lineIds`) order their products.
  const lineIds = idsOf("lineIds");
  const fromLines = lineIds.length
    ? (await prisma.inventoryItem.findMany({ where: { id: { in: lineIds }, site: { companyId } }, select: { productId: true } }))
        .map((line) => line.productId)
        .filter((id): id is string => Boolean(id))
    : [];
  const productIds = [...new Set([...idsOf("productIds"), ...fromLines])];
  const quantity = Number(search.get("quantity") ?? "");
  const siteParam = search.get("siteId");
  const siteId =
    siteParam && (await prisma.site.findFirst({ where: { id: siteParam, companyId }, select: { id: true } }))
      ? siteParam
      : await defaultSiteFor(companyId, session.user.id);
  if (!siteId) return errorResponse("Add a site first.", 409);
  const suggestion = await suggestFor(companyId, {
    supplierId: path.data.id === "auto" ? null : path.data.id,
    siteId,
    productIds: productIds.length ? productIds : null,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : null,
  });
  if (!suggestion) return errorResponse(path.data.id === "auto" ? "None of these products names a supplier." : "Supplier not found", 404);
  return successResponse({ data: suggestion });
}
