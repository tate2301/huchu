import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, voidDocument } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import {
  decideSupplierPayment,
  deleteUnpaidSupplierPayment,
  paySupplierPayment,
  submitSupplierPayment,
} from "@/lib/books/core/supplier-payments";

/** A supplier payment's moves (D5, books-final §4.10): send for approval, approve or send back, pay, void. */
const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pay", "void"]),
  note: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().min(3).max(300).optional(),
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
        return successResponse(await submitSupplierPayment(actor, id));
      case "approve":
      case "reject":
        return successResponse(await decideSupplierPayment(actor, id, { approve: body.action === "approve", note: body.note }));
      case "pay":
        return successResponse(await paySupplierPayment(actor, id));
      case "void":
        if (!body.reason) return errorResponse("Say why, in a few words. The reason is kept in the audit trail.", 400);
        return successResponse(await voidDocument(actor, "payment", id, { reason: body.reason }));
    }
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] PATCH /api/books/payments-made/[id] error:", error);
    return errorResponse("Could not change the payment");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    return successResponse(await deleteUnpaidSupplierPayment(await booksActor(sessionResult.session), id));
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] DELETE /api/books/payments-made/[id] error:", error);
    return errorResponse("Could not delete the payment");
  }
}
