import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, closeReconciliation, reopenReconciliation, voidReconciliation } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("void"), reason: z.string().trim().min(3).max(500) }),
]);

/** Close at 0.00 (manager or accountant); reopen or void (the owner, with a reason). The core refuses on its own. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const body = schema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    const rec =
      body.action === "close"
        ? await closeReconciliation(actor, id)
        : body.action === "reopen"
          ? await reopenReconciliation(actor, id, body.reason)
          : await voidReconciliation(actor, id, body.reason);
    return successResponse({ id: rec.id, status: rec.status });
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/reconciliations/[id] error:", error);
    return errorResponse("The reconciliation was not changed");
  }
}
