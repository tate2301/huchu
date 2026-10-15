import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUseExplore, EXPLORE_ROLES, lockedTables, whoReads, workspaceRoles } from "@/lib/explore/access";
import { savedQuestions } from "@/lib/explore/questions";
import { templatesFor } from "@/lib/explore/templates";
import { prisma } from "@/lib/prisma";
import { readableSources, readerOf, toSource } from "@/lib/reports/custom/sources";
import { listCustomReports } from "@/lib/reports/custom/store";
import { sqlName } from "@/lib/reports/sql/schema";

/**
 * Explore's panel and its Templates and Saved tabs: the tables this person
 * reads (the report sources they can open, with their columns), the ones their
 * role does not and who does, the templates over their tables, and the
 * questions saved as reports. A person who may not use Explore is told who can.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const company = await prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } });
    const workspaceName = company?.name ?? "this workspace";
    if (!canUseExplore(session.user.role)) {
      return successResponse({ canUse: false, who: whoReads(EXPLORE_ROLES), workspaceName });
    }

    const sources = (await readableSources(session)).map(toSource);
    const own = new Set(sources.map((source) => source.key));
    const locked = lockedTables(own, session.user.enabledFeatures, workspaceRoles(session.user.workspaceProfile));
    const templates = templatesFor(new Set(sources.map((source) => sqlName(source.key))));
    const saved = savedQuestions(await listCustomReports(readerOf(session)));
    return successResponse({ canUse: true, workspaceName, sources, locked, templates, saved });
  } catch (error) {
    console.error("[API] GET /api/explore/catalog error:", error);
    return errorResponse("Could not read what Explore can show");
  }
}
