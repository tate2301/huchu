import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { successResponse } from "@/lib/api-response";
import { sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isOpenForDelivery } from "@/lib/retail/purchase-orders";
import { requireRetailSession } from "../../_helpers";

/**
 * The orders the Deliveries page's receive dialog books against, until the
 * Receive page (BUY-06) replaces it: every order not in the bin, with its
 * supplier's name and whether a delivery can still come against it.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Purchase orders carry supplier and unit cost. A stock clerk sees them
  // because they cannot book a delivery in against an order they cannot see; a
  // cashier has no business knowing what the shop pays Delta.
  const gate = requireRetailPermission(session, "retail.purchasing", "view");
  if (gate) return gate;

  const search = new URL(request.url).searchParams.get("search")?.trim();
  const where: Prisma.RetailPurchaseOrderWhereInput = { companyId: session.user.companyId, archivedAt: null };
  if (search) {
    where.OR = [
      { poNo: { contains: search, mode: "insensitive" } },
      { vendor: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orders = await prisma.retailPurchaseOrder.findMany({
    where,
    include: { lines: true, vendor: { select: { name: true } }, site: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: "desc" },
  });

  return successResponse({
    data: orders.map(({ vendor, ...order }) => ({
      ...order,
      supplierName: vendor.name,
      open: isOpenForDelivery(order.status),
      totalValue: toNumberOrZero(sumMoney(order.lines.map((line) => line.lineTotal))),
      totalQuantity: toNumberOrZero(sumMoney(order.lines.map((line) => line.quantity))),
      receivedQuantity: toNumberOrZero(sumMoney(order.lines.map((line) => line.receivedQuantity))),
    })),
  });
}
