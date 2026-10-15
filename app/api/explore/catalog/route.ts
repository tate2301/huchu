import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUseExplore, lockedTables, whoReads, workspaceRoles } from "@/lib/explore/access";
import { savedQuestions } from "@/lib/explore/questions";
import { countRows, exploreReaderReady, exploreScope } from "@/lib/explore/reader";
import { exploreRoles } from "@/lib/explore/runs";
import { templatesFor } from "@/lib/explore/templates";
import { prisma } from "@/lib/prisma";
import { readableSources, readerOf, toSource } from "@/lib/reports/custom/sources";
import { listCustomReports } from "@/lib/reports/custom/store";
import { sqlName } from "@/lib/reports/sql/schema";

/**
 * Explore's panel and its Templates and Saved tabs. With Explore's own login
 * set up, the tables are the workspace's real ones the person's role reads,
 * with their row counts, and the templates are written over them; until
 * then they are the report sources the person can open, run in their tab.
 * Either way: the ones their role does not read and who does, and the
 * questions saved as reports. A person who may not use Explore is told who can.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const [company, roles] = await Promise.all([
      prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } }),
      exploreRoles(prisma, session.user.companyId),
    ]);
    const workspaceName = company?.name ?? "this workspace";
    if (!canUseExplore(session.user.role, roles)) {
      return successResponse({ canUse: false, who: whoReads(roles), workspaceName });
    }

    const sources = (await readableSources(session)).map(toSource);
    const saved = savedQuestions(await listCustomReports(readerOf(session)));

    if (exploreReaderReady()) {
      const scope = await exploreScope({ role: session.user.role, enabledFeatures: session.user.enabledFeatures, workspaceProfile: session.user.workspaceProfile });
      const counts = await countRows({ companyId: session.user.companyId, userId: session.user.id }, scope.tables);
      const tables = scope.tables.map((table) => (counts.has(table.name) ? { ...table, rows: counts.get(table.name) } : table));
      const templates = templatesFor(new Set(tables.map((table) => table.name)), "tables");
      return successResponse({ canUse: true, engine: "tables", workspaceName, sources, tables, locked: scope.locked, templates, saved });
    }

    const own = new Set(sources.map((source) => source.key));
    const locked = lockedTables(own, session.user.enabledFeatures, workspaceRoles(session.user.workspaceProfile));
    const templates = templatesFor(new Set(sources.map((source) => sqlName(source.key))));
    return successResponse({ canUse: true, engine: "sources", workspaceName, sources, tables: null, locked, templates, saved });
  } catch (error) {
    console.error("[API] GET /api/explore/catalog error:", error);
    return errorResponse("Could not read what Explore can show");
  }
}
