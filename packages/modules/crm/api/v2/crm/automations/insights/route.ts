import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { REPORT_RANGES, rangeToDates, type ReportRange } from "../../../../../reports";
import {
  failureGroups,
  rulePerformance,
  runTotals,
  type RunRecord,
} from "../../../../../run-insights";

/**
 * How the workflows have been behaving.
 *
 * The run list already says what happened; this says whether it is going
 * well. Kept to one query over one window so every figure on the page is a
 * cut of the same rows — two endpoints would let the headline disagree with
 * the table under it.
 *
 * Capped, because a company with noisy rules can accumulate a great many runs
 * and this is a summary, not an export. The cap is reported so a reader knows
 * when they are looking at a sample.
 */
const CAP = 5_000;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("range");
    const range: ReportRange = REPORT_RANGES.find((value) => value === requested) ?? "30d";
    const { from, to } = rangeToDates(range);

    const rows = await prisma.crmAutomationRun.findMany({
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        automationId: true,
        status: true,
        durationMs: true,
        actionCount: true,
        result: true,
        createdAt: true,
        automation: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: CAP,
    });

    const runs: RunRecord[] = rows.map((row) => ({
      automationId: row.automationId,
      automationName: row.automation?.name ?? "Deleted workflow",
      status: row.status,
      durationMs: row.durationMs,
      actionCount: row.actionCount,
      createdAt: row.createdAt,
      result: row.result,
    }));

    return successResponse({
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      totals: runTotals(runs),
      byRule: rulePerformance(runs).slice(0, 12),
      failures: failureGroups(runs),
      truncated: rows.length === CAP,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/automations/insights error:", error);
    return errorResponse("Failed to summarise the workflow runs");
  }
}
