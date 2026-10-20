import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, bulkAction, BULK_LIMIT, bulkSummary, isBulkAction, isUndoKind } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { REASON_MAX } from "@/lib/books/core/undo-rules";

/**
 * `POST /api/books/core/<kind>/bulk/<action>` (books-final §5.13): send,
 * remind, void, delete, mark-paid or export over up to 500 rows, each row on
 * its own with this person's rights checked for it. Answers per row: done,
 * skipped with why, or failed.
 */

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(BULK_LIMIT),
  reason: z.string().max(REASON_MAX).optional(),
  confirm: z.string().max(40).optional(),
  bankAccountId: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string; action: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { kind, action } = await params;
    if (!isUndoKind(kind)) return errorResponse("There is no such kind of document.", 404);
    if (!isBulkAction(action)) return errorResponse("There is no such bulk action.", 404);
    const body = schema.parse(await request.json().catch(() => null));
    const result = await bulkAction(await booksActor(sessionResult.session), kind, action, body.ids, { reason: body.reason, confirm: body.confirm, bankAccountId: body.bankAccountId });
    return successResponse({ ...result, summary: bulkSummary(result) });
  } catch (error) {
    const refusal = refusedResponse(error, "Choose the rows, and say why");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/core/[kind]/bulk/[action] error:", error);
    return errorResponse("Nothing was changed");
  }
}
