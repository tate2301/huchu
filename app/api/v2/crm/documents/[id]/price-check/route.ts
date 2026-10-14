import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { changeLineToListedPrice, checkQuoteAgainstPriceList, QuoteCheckRefused } from "@/lib/crm/quote-check";

/** A quote's lines checked against the price list: the ones priced differently, and what the list says. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const check = await checkQuoteAgainstPriceList(sessionResult.session.user.companyId, (await params).id);
    if (!check) return errorResponse("Quote not found", 404);
    return successResponse(check);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/documents/[id]/price-check error:", error);
    return errorResponse("Could not check the quote");
  }
}

const changeSchema = z.object({ position: z.number().int().min(0) });

/** "Change the line": one line to the price list's price, as the person editing the quote would. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = changeSchema.parse(await request.json());
    const changed = await changeLineToListedPrice(sessionResult.session, (await params).id, body.position);
    return successResponse(changed);
  } catch (error) {
    if (error instanceof QuoteCheckRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Say which line", 400, error.issues);
    console.error("[API] POST /api/v2/crm/documents/[id]/price-check error:", error);
    return errorResponse("Could not change the line");
  }
}
