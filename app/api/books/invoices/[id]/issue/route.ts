import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { DraftInvoiceRefused, issueDraftInvoice } from "@/lib/books/issue-invoice";
import { asMineSchema, VaneDraftNotTakenOn } from "@/lib/vane/drafts";

/**
 * Issues a draft invoice as the person: posted to the books, and fiscalised
 * where the workspace fiscalises. Vane's draft that nobody has taken on is
 * issued only with `asMine: true`, which makes the person its maker; without
 * it, 409.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { refused } = await guardBooks(session, "issue", { kind: "invoice" });
    if (refused) return refused;
    const body = (await request.json().catch(() => ({}))) as { asMine?: unknown } | null;
    const asMine = asMineSchema.safeParse(body?.asMine);
    if (!asMine.success) return errorResponse("asMine is true or false", 400);
    const issued = await issueDraftInvoice({ companyId: session.user.companyId, userId: session.user.id }, (await params).id, { asMine: asMine.data });
    return successResponse({ id: issued.id, number: issued.invoiceNumber, customer: issued.customer.name });
  } catch (error) {
    if (error instanceof DraftInvoiceRefused) return errorResponse(error.message, 409);
    if (error instanceof VaneDraftNotTakenOn) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/invoices/[id]/issue error:", error);
    return errorResponse("Could not issue the invoice");
  }
}
