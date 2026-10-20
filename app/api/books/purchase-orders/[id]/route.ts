import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor } from "@/lib/books/core";
import { cancelPurchaseOrder, closePurchaseOrder, decidePurchaseOrder, submitPurchaseOrder } from "@/lib/books/core/purchase-orders";
import { refusedResponse } from "@/lib/books/core/refused";

/** A purchase order's moves (books-final §4.7): submit, approve or send back, cancel, close and reopen. */
const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "cancel", "close", "reopen"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    switch (body.action) {
      case "submit":
        return successResponse(await submitPurchaseOrder(actor, id));
      case "approve":
      case "reject":
        return successResponse(await decidePurchaseOrder(actor, id, { approve: body.action === "approve", note: body.note }));
      case "cancel":
        return successResponse(await cancelPurchaseOrder(actor, id));
      case "close":
      case "reopen":
        return successResponse(await closePurchaseOrder(actor, id, { reopen: body.action === "reopen", note: body.note }));
    }
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] PATCH /api/books/purchase-orders/[id] error:", error);
    return errorResponse("Could not change the purchase order");
  }
}
