import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { loadWeekInsights } from "@/lib/reports/week-insights-server";

/**
 * Reports → Insights (ReportsInsights): the week's insights for whoever asks,
 * from Vane's INSIGHT items or, without them, from the rows of the reports
 * they can open. Reads only; Pin and Not useful use the custom report and
 * Vane item routes, pressed by a person.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse(await loadWeekInsights(sessionResult.session));
  } catch (error) {
    console.error("[API] GET /api/v2/reports/insights error:", error);
    return errorResponse("Failed to read the insights");
  }
}
