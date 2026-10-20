import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { approveManualJournal, deleteDraftJournal, JournalRefused, postManualJournal, reverseManualJournal, withdrawManualJournal } from "@/lib/books/core/manual-journals";
import { readJournal } from "@/lib/books/journals";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** One journal's lines, and what posting it takes. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const { id } = await params;
    const journal = await readJournal(prisma, sessionResult.session.user.companyId, id);
    if (!journal) return errorResponse("That journal is not in this workspace", 404);
    return successResponse(journal);
  } catch (error) {
    console.error("[API] GET /api/books/journals/[id] error:", error);
    return errorResponse("Could not read the journal");
  }
}

const schema = z.object({
  action: z.enum(["post", "approve", "withdraw", "reverse"]),
  reason: z.string().max(500).nullish(),
  periodOverrideReason: z.string().max(500).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/** Post, Approve and post, Withdraw or send back, Reverse: each through the core, which refuses on its own. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    const { id } = await params;
    const body = schema.parse(await request.json());
    switch (body.action) {
      case "post":
        return successResponse(await postManualJournal(actor, id, body.periodOverrideReason));
      case "approve":
        return successResponse(await approveManualJournal(actor, id, body.periodOverrideReason));
      case "withdraw":
        return successResponse(await withdrawManualJournal(actor, id, body.reason));
      case "reverse":
        return successResponse(await reverseManualJournal(actor, id, { reason: body.reason, date: body.date ? new Date(`${body.date}T00:00:00.000Z`) : null, periodOverrideReason: body.periodOverrideReason }), 201);
    }
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("That is not something a journal can do", 400, error.issues);
    if (error instanceof JournalRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/journals/[id] error:", error);
    return errorResponse("The journal was not changed");
  }
}

/** Delete a draft: free, it has no number. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    const { id } = await params;
    await deleteDraftJournal(actor, id);
    return successResponse({ id });
  } catch (error) {
    if (error instanceof JournalRefused) return errorResponse(error.message, error.status);
    console.error("[API] DELETE /api/books/journals/[id] error:", error);
    return errorResponse("The draft was not deleted");
  }
}
