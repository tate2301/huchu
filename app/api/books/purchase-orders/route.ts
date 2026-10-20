import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { ordersCsv, readOrderQuery, readOrders } from "@/lib/books/orders";
import { resolveBaseCurrency } from "@/lib/money";
import { createPurchaseOrder, purchaseOrderSchema } from "@/lib/books/core/purchase-orders";
import { refusedResponse } from "@/lib/books/core/refused";
import { prisma } from "@/lib/prisma";

/** Purchase orders, the shop's and Books' in one table (D11): the list (BkOrders), and a new draft. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = readOrderQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await ordersCsv(prisma, actor.companyId, query), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="purchase-orders.csv"' } });
    }
    const view = await readOrders(prisma, actor.companyId, query, (await resolveBaseCurrency(actor.companyId)).toUpperCase());
    return successResponse({
      ...view,
      can: { create: canDo(actor, "draft.create", { kind: "purchase-order" }).allowed, approve: canDo(actor, "approve", { kind: "purchase-order" }).allowed },
      me: actor.userId,
    });
  } catch (error) {
    console.error("[API] GET /api/books/purchase-orders error:", error);
    return errorResponse("Could not load the purchase orders");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = purchaseOrderSchema.parse(await request.json());
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "purchase-order" });
    if (refused) return refused;
    return successResponse(await createPurchaseOrder(actor, input), 201);
  } catch (error) {
    const refused = refusedResponse(error, "Choose the supplier and add what is ordered.");
    if (refused) return refused;
    console.error("[API] POST /api/books/purchase-orders error:", error);
    return errorResponse("Could not save the purchase order");
  }
}
