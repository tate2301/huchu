import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo, guardBooks } from "@/lib/books/core";
import { ReceiptRefused } from "@/lib/books/core/receipt-facts";
import { asUndoRefused, deleteDocument } from "@/lib/books/core/undo";
import { ensureCrmDocument } from "@/lib/books/crm-document-bridge";
import { applyPaymentSchema, applyReceiptToInvoices } from "@/lib/books/payment-apply";
import { openInvoicesFor } from "@/lib/books/payment-create";
import { readPaymentRecord, type PaymentRecordPage } from "@/lib/books/payment-record";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const record = await readPaymentRecord(prisma, session.user.companyId, (await params).id);
    if (!record) return errorResponse("There is no such payment in this workspace", 404);

    const actor = await booksActor(session);
    const isOnAccount = !record.voided && !record.invoice;
    const openInvoices =
      isOnAccount && record.customer.id
        ? (await openInvoicesFor(session.user.companyId, record.customer.id)).filter(
            (inv) => inv.currency.toUpperCase() === record.currency.toUpperCase(),
          )
        : [];
    const page: PaymentRecordPage = {
      ...record,
      can: {
        void: !record.voided && canDo(actor, "void", { kind: "receipt" }).allowed,
        apply: isOnAccount && canDo(actor, "issue", { kind: "receipt" }).allowed,
      },
      openInvoices,
      crmDocument: await ensureCrmDocument(session.user.companyId, record.id),
    };
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/payments/[id] error:", error);
    return errorResponse("Could not read the payment");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "issue", { kind: "receipt" });
    if (refused) return refused;
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = applyPaymentSchema.parse({ allocations: body?.allocations });
    const result = await applyReceiptToInvoices(actor, id, parsed.allocations);
    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Select at least one invoice and enter an amount to apply.", 400, error.issues);
    if (error instanceof ReceiptRefused) return errorResponse(error.message, error.status);
    console.error("[API] PATCH /api/books/payments/[id] error:", error);
    return errorResponse("Could not apply the payment to the invoice");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = (await request.json().catch(() => null)) as { reason?: unknown; confirm?: unknown } | null;
    const actor = await booksActor(session);
    const id = (await params).id;
    const record = await readPaymentRecord(prisma, session.user.companyId, id);
    if (!record) return errorResponse("There is no such payment in this workspace", 404);
    const done = await deleteDocument(actor, "receipt", record.id, {
      reason: typeof body?.reason === "string" ? body.reason : null,
    });
    return successResponse({ deleted: done.label });
  } catch (error) {
    const refused = asUndoRefused(error);
    if (refused) return errorResponse(refused.message, refused.status);
    console.error("[API] DELETE /api/books/payments/[id] error:", error);
    return errorResponse("Could not delete the payment");
  }
}
