import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, markTestDevice } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { REASON_MAX } from "@/lib/books/core/undo-rules";

const schema = z.object({ isTestDevice: z.boolean(), reason: z.string().max(REASON_MAX) });

/** D18: the owner marks a fiscal device as registered against ZIMRA's test environment, or not, with a reason. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = schema.parse(await request.json().catch(() => null));
    return successResponse(await markTestDevice(await booksActor(sessionResult.session), (await params).id, body));
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] PATCH /api/books/core/fiscal-devices/[id] error:", error);
    return errorResponse("The device was not changed");
  }
}
