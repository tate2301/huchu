import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { readStockLines } from "@/lib/retail/stock/lines";

import { requireRetailSession } from "../../_helpers";

const querySchema = z.object({
  productId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
});

/**
 * Stock lines (30-stock 4.2): `?productId=&siteId=` → `{ data: StockLineView[],
 * siteCount, defaultSiteId, pinOver }`. `retail.stock:view`, or `retail.adjustments:create`
 * for the Adjust stock sheet (its first reader). `pinOver` is the adjustment
 * value over which a manager's PIN is asked ("50.00").
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = canRetailSessionDo(session, "retail.adjustments", "create")
    ? null
    : requireRetailPermission(session, "retail.stock", "view");
  if (gate) return gate;

  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorResponse("Pick a product or a site from the list.", 400);

  const companyId = session.user.companyId;
  const [data, siteCount, limits, profile] = await Promise.all([
    readStockLines(companyId, query.data, session.user.role),
    prisma.site.count({ where: { companyId, isActive: true } }),
    getApprovalLimits(companyId),
    prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } }),
  ]);
  return successResponse({
    data,
    siteCount,
    defaultSiteId: profile?.defaultSiteId ?? null,
    pinOver: limits.adjustmentPinOver.toFixed(2),
  });
}
