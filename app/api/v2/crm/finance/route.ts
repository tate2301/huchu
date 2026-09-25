/**
 * The finance overview — money in, money out, and where it all stands.
 *
 * Read-only, and only for somebody who may see everybody's money
 * (`money.view_all`). The figures are `financeOverview`'s; this route turns
 * the query string into its scope. The period is `from` and `to`, defaulting
 * to this month so far (`lib/crm/period.ts`).
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { financeOverview } from "@/lib/crm/finance";
import { dayKey, periodFromQuery } from "@/lib/crm/period";
import { requireCrmCapability } from "../_helpers";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    if (!(await requireCrmCapability(session, "money.view_all"))) {
      return errorResponse("Only somebody who may see everybody's money can open the finance overview", 403);
    }

    const { searchParams } = new URL(request.url);
    const period = periodFromQuery(searchParams);
    if (!period) return errorResponse("The period ends before it starts", 400);

    const overview = await financeOverview(prisma, {
      companyId,
      ...period,
      projectId: searchParams.get("project"),
      userId: searchParams.get("person"),
      currency: searchParams.get("currency"),
      viewerId: session.user.id,
    });

    return successResponse({ ...overview, period: { from: dayKey(period.from), to: dayKey(period.to) } });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/finance error:", error);
    return errorResponse("Failed to load the finance overview");
  }
}
