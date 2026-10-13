import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createSavedView, listSavedViews } from "@/lib/saved-views/store";
import { savedViewInputSchema } from "@/lib/saved-views/view";

/** The saved views of one page (`?path=/books/invoices`): yours and the shared ones. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const views = await listSavedViews(prisma, { id: user.id, role: user.role, companyId: user.companyId }, path);
    return successResponse({ views });
  } catch (error) {
    console.error("[API] GET /api/saved-views error:", error);
    return errorResponse("Could not read the saved views");
  }
}

/** Add to Saved views: the address being looked at, under a name. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    const parsed = savedViewInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That view could not be read", 400);
    const result = await createSavedView(prisma, { id: user.id, role: user.role, companyId: user.companyId }, parsed.data);
    if (!result.ok) return errorResponse(result.message, result.status);
    return successResponse({ view: result.view }, 201);
  } catch (error) {
    console.error("[API] POST /api/saved-views error:", error);
    return errorResponse("Could not save the view");
  }
}
