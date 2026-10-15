import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { buildBadges, buildCounts, buildFinding } from "@/lib/build/items";
import { readBuildItems } from "@/lib/build/read";
import { templatesView } from "@/lib/build/templates";

/**
 * Everything this workspace has built, the templates it can start from, and
 * the figures beside Build's panel rows. Only what the workspace is
 * provisioned for is read; each builder's own API still says who may change it.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    const { items, provisions } = await readBuildItems({
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
      enabledFeatures: user.enabledFeatures,
    });
    const templates = templatesView(items, provisions, user.enabledFeatures);
    const counts = buildCounts(items);
    return successResponse({
      items,
      counts,
      finding: buildFinding(items),
      templates,
      provisions,
      badges: buildBadges(counts, { corelith: templates.corelith.length, made: templates.made.length, retired: templates.retired.length }),
      /** Starting a form, a document or a layout is a manager's: the builders' APIs say the same. */
      canStart: user.role === "SUPERADMIN" || user.role === "MANAGER",
    });
  } catch (error) {
    console.error("[API] GET /api/build error:", error);
    return errorResponse("Could not read what is built here");
  }
}
