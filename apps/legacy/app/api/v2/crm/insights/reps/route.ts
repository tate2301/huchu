import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { insightsRepFilter } from "@/lib/crm/scope";
import { getRepPerformance } from "@/lib/crm/insights";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const repId = insightsRepFilter(session);

    const parse = (v: string | null) => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const rows = await getRepPerformance(session.user.companyId, {
      from: parse(from),
      to: parse(to),
      repId,
    });
    return successResponse({ data: rows });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/insights/reps error:", error);
    return errorResponse("Failed to fetch rep performance");
  }
}
