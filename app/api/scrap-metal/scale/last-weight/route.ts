import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";

type LocalScaleResponse = {
  kg: number;
  capturedAt?: string;
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;

    const helperUrl = process.env.SCRAP_SCALE_HELPER_URL?.trim();
    if (!helperUrl) {
      return errorResponse("Scale helper is not configured");
    }

    const response = await fetch(helperUrl, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return errorResponse("Scale helper did not respond", 502);
    }
    const data = (await response.json()) as LocalScaleResponse;
    if (typeof data.kg !== "number" || Number.isNaN(data.kg)) {
      return errorResponse("Scale helper returned an invalid reading", 502);
    }

    return successResponse({
      kg: data.kg,
      source: "local-helper" as const,
      capturedAt: data.capturedAt ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/scale/last-weight error:", error);
    return errorResponse("Failed to read scale helper");
  }
}

