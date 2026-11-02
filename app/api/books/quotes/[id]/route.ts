import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { asUndoRefused, deleteDocument } from "@/lib/books/core/undo";
import { ensureCrmDocument } from "@/lib/books/crm-document-bridge";
import { readQuoteRecord, type QuoteRecordPage } from "@/lib/books/quote-record";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const record = await readQuoteRecord(prisma, session.user.companyId, (await params).id);
    if (!record) return errorResponse("There is no such quote in this workspace", 404);

    const actor = await booksActor(session);
    const draft = record.status === "DRAFT";
    const live = record.status === "SENT" || record.status === "ACCEPTED";
    const page: QuoteRecordPage = {
      ...record,
      can: {
        issue: draft && canDo(actor, "issue", { kind: "quotation" }).allowed,
        convert: live && canDo(actor, "issue", { kind: "invoice" }).allowed,
      },
      crmDocument: await ensureCrmDocument(session.user.companyId, record.id),
    };
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/quotes/[id] error:", error);
    return errorResponse("Could not read the quote");
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
    const record = await readQuoteRecord(prisma, session.user.companyId, id);
    if (!record) return errorResponse("There is no such quote in this workspace", 404);
    const done = await deleteDocument(actor, "quote", record.id, {
      reason: typeof body?.reason === "string" ? body.reason : null,
    });
    return successResponse({ deleted: done.label, draft: record.status === "DRAFT" });
  } catch (error) {
    const refused = asUndoRefused(error);
    if (refused) return errorResponse(refused.message, refused.status);
    console.error("[API] DELETE /api/books/quotes/[id] error:", error);
    return errorResponse("Could not delete the quote");
  }
}
