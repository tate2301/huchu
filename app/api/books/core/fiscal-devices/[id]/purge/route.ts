import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, planPurge, purgeTestDevice } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { REASON_MAX } from "@/lib/books/core/undo-rules";

const schema = z.object({ reason: z.string().max(REASON_MAX), confirm: z.string().max(40) });

/** D18: what a purge would remove and skip, read without changing anything (the confirm dialog lists it). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse(await planPurge(await booksActor(sessionResult.session), (await params).id));
  } catch (error) {
    const refusal = refusedResponse(error);
    if (refusal) return refusal;
    console.error("[API] GET /api/books/core/fiscal-devices/[id]/purge error:", error);
    return errorResponse("Could not read what a purge would remove");
  }
}

/** D18: the owner purges what a test device signed, with a reason and "purge" typed. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = schema.parse(await request.json().catch(() => null));
    if (body.confirm.trim().toLowerCase() !== "purge") return errorResponse('Type "purge" to purge the test device.', 400);
    return successResponse(await purgeTestDevice(await booksActor(sessionResult.session), (await params).id, { reason: body.reason }));
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/core/fiscal-devices/[id]/purge error:", error);
    return errorResponse("Nothing was purged");
  }
}
