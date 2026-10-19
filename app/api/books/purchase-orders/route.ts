import { NextRequest, NextResponse } from "next/server";

import { errorResponse, getPaginationParams, paginationResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { createPurchaseOrder, purchaseOrderSchema } from "@/lib/books/core/purchase-orders";
import { refusedResponse } from "@/lib/books/core/refused";
import { prisma } from "@/lib/prisma";

/** Purchase orders, the shop's and Books' in one table (D11): the list, and a new draft. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);
    const where = {
      companyId: sessionResult.session.user.companyId,
      archivedAt: null,
      ...(status ? { status: status as never } : {}),
      ...(searchParams.get("source") === "books" ? { siteId: null } : searchParams.get("source") === "retail" ? { siteId: { not: null } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.retailPurchaseOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { vendor: { select: { id: true, name: true } }, site: { select: { id: true, name: true } }, lines: true } }),
      prisma.retailPurchaseOrder.count({ where }),
    ]);
    return successResponse(paginationResponse(rows, total, page, limit));
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
