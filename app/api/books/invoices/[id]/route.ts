import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { invoicePage } from "@/lib/books/invoice-page";

/** One invoice in Books, and Vane's draft invoice (PageVaneDraft). Read only: issuing is the invoice route's, as the person. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const page = await invoicePage({ companyId: session.user.companyId, role: session.user.role }, id);
    if (!page) return errorResponse("Invoice not found", 404);
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/invoices/[id] error:", error);
    return errorResponse("Could not read the invoice");
  }
}
