import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { asUndoRefused, deleteDocument } from "@/lib/books/core/undo";
import { ensureCrmDocument } from "@/lib/books/crm-document-bridge";
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
    const page: PaymentRecordPage = {
      ...record,
      can: {
        void: !record.voided && canDo(actor, "void", { kind: "receipt" }).allowed,
      },
      crmDocument: await ensureCrmDocument(session.user.companyId, record.id),
    };
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/payments/[id] error:", error);
    return errorResponse("Could not read the payment");
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
