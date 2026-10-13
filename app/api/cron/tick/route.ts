import { NextResponse } from "next/server";

import { RETAIL_JOBS } from "@/lib/retail/jobs";
import { isCronRequest } from "@/lib/scheduled-jobs/cron-request";
import { runDueJobs } from "@/lib/scheduled-jobs/run";
import { VANE_JOBS } from "@/lib/vane/jobs";

/**
 * The scheduler's tick: cron-job.org calls it every minute (docs/scheduled-jobs.md)
 * and it runs whichever scheduled jobs are due.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Stop starting jobs well before `maxDuration`; the rest stay due for the next tick. */
const BUDGET_MS = 90_000;

export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const outcomes = await runDueJobs([...RETAIL_JOBS, ...VANE_JOBS], { budgetMs: BUDGET_MS });
  return NextResponse.json({ outcomes });
}
