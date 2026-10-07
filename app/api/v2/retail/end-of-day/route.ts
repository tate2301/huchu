import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { DayRefused, dayRefusalResponse, endOfDayView } from "@/lib/retail/floor/day-close";
import { requireRetailSession } from "../_helpers";

/**
 * End of day (50-floor W-43, FLR-07): one site's trading day — its tills, how
 * people paid, what is left before it closes, and the cash to bank; once
 * closed, the figures it froze. `?siteId=&date=`, by default the person's site
 * and today. Owners, managers and the bookkeeper read it.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const params = new URL(request.url).searchParams;
  try {
    return successResponse({ data: await endOfDayView(session, { siteId: params.get("siteId"), date: params.get("date") }) });
  } catch (error) {
    if (error instanceof DayRefused) return dayRefusalResponse(error);
    throw error;
  }
}
