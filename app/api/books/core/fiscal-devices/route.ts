import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, fiscalDevicesFor } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

/** D18: the workspace's fiscal devices and whether each is ZIMRA's test environment, for the owner. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse({ devices: await fiscalDevicesFor(await booksActor(sessionResult.session)) });
  } catch (error) {
    const refusal = refusedResponse(error);
    if (refusal) return refusal;
    console.error("[API] GET /api/books/core/fiscal-devices error:", error);
    return errorResponse("Could not read the fiscal devices");
  }
}
