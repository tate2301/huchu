import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { sendDueReportSchedules } from "@/lib/reports/schedule-sender";

/**
 * The report sender, for a scheduler that calls the app over HTTP: it sends
 * every due report schedule once (`lib/reports/schedule-sender.ts`). The
 * retail worker runs the same sender every five minutes
 * (`lib/retail/worker/jobs.ts`); a second caller is harmless, since each slot
 * is claimed before it is sent.
 *
 * Only a caller holding `CRON_SECRET` gets in. It makes and turns on nothing:
 * a schedule is only ever made, or turned back on, by a person on the report.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  try {
    return successResponse({ result: await sendDueReportSchedules(new Date()) });
  } catch (error) {
    console.error("[API] GET /api/cron/report-schedules error:", error);
    return errorResponse("The report sender failed");
  }
}
