import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksBadges, readBooksCounts } from "@/lib/books/nav-counts";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";
import { prisma } from "@/lib/prisma";

/** The figures beside Books' panel rows, keyed by each row's address. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    if (!hasTokenFeature(user.enabledFeatures, "accounting.core")) return successResponse({ badges: {} });
    const counts = await readBooksCounts(prisma, user.companyId, {
      takings: hasTokenFeature(user.enabledFeatures, "retail.shifts"),
    });
    return successResponse({ badges: booksBadges(counts) });
  } catch (error) {
    console.error("[API] GET /api/books/nav error:", error);
    return errorResponse("Could not count Books' rows");
  }
}
