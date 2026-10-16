import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { deleteInvoice, readInvoiceRemoval } from "@/lib/books/delete-invoice";
import { readInvoiceRecord, type InvoiceRecordPage } from "@/lib/books/invoice-record";
import { InvoiceChangeRefused, isWorkspaceOwner } from "@/lib/books/owner";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * One invoice in Books, with its lines and the quote it came from (PageVaneDraft), and what this person may do with it there:
 * issue a draft; delete a draft (who may change drafts) or anything else (the owner); reverse an issued or paid one (the owner).
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const record = await readInvoiceRecord(prisma, session.user.companyId, (await params).id);
    if (!record) return errorResponse("There is no such invoice in this workspace", 404);
    const mayChange = isRouteAllowedForRole(session.user.role, "/api/accounting/sales/invoices", "PATCH");
    const owner = isWorkspaceOwner(session.user.role);
    const draft = record.status === "DRAFT";
    const mayDelete = draft ? mayChange : owner;
    const page: InvoiceRecordPage = {
      ...record,
      can: { issue: mayChange && draft, delete: mayDelete, reverse: owner && (record.status === "ISSUED" || record.status === "PAID") },
      removal: mayDelete ? await readInvoiceRemoval(session.user.companyId, record.id) : null,
    };
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/invoices/[id] error:", error);
    return errorResponse("Could not read the invoice");
  }
}

/**
 * Deletes the invoice and what it wrote to the books (`lib/books/delete-invoice.ts`). A draft: anyone who may change drafts.
 * Anything else: the workspace's owner, with `reason` and the number typed as `confirm`. Payments stay, on account.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = (await request.json().catch(() => null)) as { reason?: unknown; confirm?: unknown } | null;
    const gone = await deleteInvoice({ companyId: session.user.companyId, userId: session.user.id, role: session.user.role }, (await params).id, {
      reason: typeof body?.reason === "string" ? body.reason : null,
      confirm: typeof body?.confirm === "string" ? body.confirm : null,
    });
    return successResponse({ deleted: gone.number, draft: gone.draft, onAccount: gone.onAccount });
  } catch (error) {
    if (error instanceof InvoiceChangeRefused) return errorResponse(error.message, error.status);
    console.error("[API] DELETE /api/books/invoices/[id] error:", error);
    return errorResponse("Could not delete the invoice");
  }
}
