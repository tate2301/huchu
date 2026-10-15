import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readableSources, toSource } from "@/lib/reports/custom/sources";
import { withCurrency } from "@/lib/reports/format";
import { workspaceCurrency } from "@/lib/reports/request";

/** The sources this person can query, with their columns: what a custom report is built from. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const sources = await readableSources(sessionResult.session);
    // A sum keeps its currency through the questions built on it: the workspace's, where the source names none.
    const currency = await workspaceCurrency(sessionResult.session.user.companyId);
    return successResponse({ sources: sources.map(toSource).map((source) => ({ ...source, columns: withCurrency(source.columns, [], currency) })) });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/sources error:", error);
    return errorResponse("Failed to list report sources");
  }
}
