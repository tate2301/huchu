import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { BillRefused, billSchema, createPurchaseBill } from "@/lib/books/bill-create";
import { guardBooks } from "@/lib/books/core";
import { prisma } from "@/lib/prisma";

const booksBillSchema = billSchema.extend({ costCenterId: z.string().uuid().optional() });

/** Books' Record a bill (BkBillNew): a draft, or received and posted through the core on its cost centre. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const input = booksBillSchema.parse(await request.json());
    const { actor, refused } = await guardBooks(session, input.receiveNow ? "issue" : "draft.create", { kind: "bill" });
    if (refused) return refused;
    if (input.costCenterId) {
      const centre = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId: actor.companyId, isActive: true }, select: { id: true } });
      if (!centre) return errorResponse("That cost centre is not here any more.", 400);
    }
    const bill = await createPurchaseBill(actor, input, { costCenterId: input.costCenterId ?? null });
    return successResponse({ id: bill.id, number: bill.billNumber, status: bill.status, supplier: bill.vendor.name, total: bill.total, currency: bill.currency }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the bill: something in it is not filled in right.", 400, error.issues);
    if (error instanceof BillRefused) return errorResponse(error.message, 400, error.details);
    console.error("[API] POST /api/books/bills error:", error);
    return errorResponse("Could not save the bill");
  }
}
