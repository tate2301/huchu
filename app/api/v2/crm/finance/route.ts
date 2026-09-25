/**
 * The finance overview — money in, money out, and where it all stands.
 *
 * Read-only, and only for somebody who may see everybody's money
 * (`money.view_all`). The figures are `financeOverview`'s; this route turns
 * the query string into its scope.
 *
 * The period is a pair of calendar days, `from` and `to`, in the same UTC
 * terms a daily log is keyed on. Without them it is this month so far — the
 * question a manager opens a finance page to ask.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { financeOverview } from "@/lib/crm/finance";
import { requireCrmCapability } from "../_helpers";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value: string | null): Date | null {
  if (!value || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from =
      day(searchParams.get("from")) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = day(searchParams.get("to")) ?? today;
    if (from > to) return errorResponse("The period ends before it starts", 400);

    const overview = await financeOverview(prisma, {
      companyId,
      from,
      to,
      projectId: searchParams.get("project"),
      userId: searchParams.get("person"),
      currency: searchParams.get("currency"),
      viewerId: session.user.id,
    });

    return successResponse({ ...overview, period: { from: dayKey(from), to: dayKey(to) } });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/finance error:", error);
    return errorResponse("Failed to load the finance overview");
  }
}
