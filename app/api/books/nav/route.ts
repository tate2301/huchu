import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksBadges, readBooksCounts } from "@/lib/books/nav-counts";
import { BOOKS_SCREENS_KEY } from "@/lib/platform/gating/route-registry";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";
import { prisma } from "@/lib/prisma";

/** The figures beside Books' panel rows, keyed by each row's address. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    // Without the screens the panel holds no rows to count (books-final §1.2).
    if (!hasTokenFeature(user.enabledFeatures, BOOKS_SCREENS_KEY)) return successResponse({ badges: {} });
    const counts = await readBooksCounts(prisma, user.companyId, {
      takings: hasTokenFeature(user.enabledFeatures, "retail.shifts"),
    });
    return successResponse({ badges: booksBadges(counts) });
  } catch (error) {
    console.error("[API] GET /api/books/nav error:", error);
    return errorResponse("Could not count Books' rows");
  }
}
