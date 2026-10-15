import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { readInvoiceRecord } from "@/lib/books/invoice-record";
import { deleteVaneDraftInvoice, DraftInvoiceRefused } from "@/lib/books/issue-invoice";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** One invoice in Books, with its lines and the quote it came from. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const record = await readInvoiceRecord(prisma, sessionResult.session.user.companyId, (await params).id);
    if (!record) return errorResponse("There is no such invoice in this workspace", 404);
    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/books/invoices/[id] error:", error);
    return errorResponse("Could not read the invoice");
  }
}

/** Deletes a draft Vane made that nobody issued. A person's drafts, and issued invoices, stay. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isRouteAllowedForRole(session.user.role, "/api/accounting/sales/invoices", "PATCH")) return errorResponse("Your role cannot change invoices", 403);
    const gone = await deleteVaneDraftInvoice(session.user.companyId, (await params).id);
    return successResponse({ deleted: gone.invoiceNumber });
  } catch (error) {
    if (error instanceof DraftInvoiceRefused) return errorResponse(error.message, 409);
    console.error("[API] DELETE /api/books/invoices/[id] error:", error);
    return errorResponse("Could not delete the draft");
  }
}
