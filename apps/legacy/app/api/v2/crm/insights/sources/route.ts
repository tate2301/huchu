import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { getSourceAttribution } from "@corelithzw/module-crm/insights";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const parse = (v: string | null) => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const result = await getSourceAttribution(session.user.companyId, {
      from: parse(from),
      to: parse(to),
    });
    return successResponse(result);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/insights/sources error:", error);
    return errorResponse("Failed to fetch source attribution");
  }
}
