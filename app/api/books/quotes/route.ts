import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";
import { readQuotes } from "@/lib/books/quotes";
import { readQuoteQuery } from "@/lib/books/quotes-view";
import { prisma } from "@/lib/prisma";

/** Books → Quotes: the CRM's quotations, by state. `crm` says whether a quote can be raised here (from a deal). */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    const view = await readQuotes(prisma, user.companyId, readQuoteQuery(new URL(request.url).searchParams));
    return successResponse({ ...view, crm: hasTokenFeature(user.enabledFeatures, "crm.core") });
  } catch (error) {
    console.error("[API] GET /api/books/quotes error:", error);
    return errorResponse("Could not read the quotes");
  }
}
