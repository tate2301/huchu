import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { BillRefused, billSchema, createPurchaseBill } from "@/lib/books/bill-create";
import { guardBooks } from "@/lib/books/core";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const vendorId = searchParams.get("vendorId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;

    const [bills, total] = await Promise.all([
      prisma.purchaseBill.findMany({
        where,
        include: {
          vendor: true,
          lines: true,
        },
        orderBy: [{ billDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.purchaseBill.count({ where }),
    ]);

    const enriched = bills.map((bill) => ({
      ...bill,
      balance:
        bill.total -
        (bill.amountPaid ?? 0) -
        (bill.debitNoteTotal ?? 0) -
        (bill.writeOffTotal ?? 0),
    }));

    return successResponse(paginationResponse(enriched, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/purchases/bills error:", error);
    return errorResponse("Failed to fetch purchase bills");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const validated = billSchema.parse(await request.json());
    const { refused } = await guardBooks(session, validated.receiveNow ? "issue" : "draft.create", { kind: "bill" });
    if (refused) return refused;
    const bill = await createPurchaseBill({ companyId: session.user.companyId, userId: session.user.id, role: session.user.role }, validated);
    return successResponse(bill, 201);
  } catch (error) {
    if (error instanceof BillRefused) return errorResponse(error.message, 400, error.details);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/purchases/bills error:", error);
    return errorResponse("Failed to create purchase bill");
  }
}
