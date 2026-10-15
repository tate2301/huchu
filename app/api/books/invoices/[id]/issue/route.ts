import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { DraftInvoiceRefused, issueDraftInvoice } from "@/lib/books/issue-invoice";

/** Issues a draft invoice as the person: posted to the books, and fiscalised where the workspace fiscalises. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isRouteAllowedForRole(session.user.role, "/api/accounting/sales/invoices", "PATCH")) return errorResponse("Your role cannot issue invoices", 403);
    const issued = await issueDraftInvoice({ companyId: session.user.companyId, userId: session.user.id }, (await params).id);
    return successResponse({ id: issued.id, number: issued.invoiceNumber, customer: issued.customer.name });
  } catch (error) {
    if (error instanceof DraftInvoiceRefused) return errorResponse(error.message, 409);
    console.error("[API] POST /api/books/invoices/[id]/issue error:", error);
    return errorResponse("Could not issue the invoice");
  }
}
