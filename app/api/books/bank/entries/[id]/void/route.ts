import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, voidBankEntry } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

/** Void a bank entry: its mirror posts, its bank side goes (refused while in a closed reconciliation). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const { reason } = schema.parse(await request.json());
    return successResponse(await voidBankEntry(await booksActor(sessionResult.session), id, reason));
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/bank/entries/[id]/void error:", error);
    return errorResponse("The entry was not voided");
  }
}
