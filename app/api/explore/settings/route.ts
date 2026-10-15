import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { workspaceRoles } from "@/lib/explore/access";
import type { ProductKey } from "@/lib/explore/products";
import { exploreGrants, exploreReaderReady } from "@/lib/explore/reader";
import { exploreRoles, readRuns, saveExploreRoles } from "@/lib/explore/runs";
import { exploreSettingsView } from "@/lib/explore/settings";
import { productOfTable } from "@/lib/explore/tables";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { prisma } from "@/lib/prisma";
import { sqlName } from "@/lib/reports/sql/schema";

async function view(session: AuthenticatedSession) {
  const companyId = session.user.companyId;
  const ready = exploreReaderReady();
  const [company, users, allowed, runs, grants] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.user.findMany({ where: { companyId, isActive: true }, select: { name: true, role: true }, orderBy: { name: "asc" } }),
    exploreRoles(prisma, companyId),
    readRuns(prisma, companyId),
    ready ? exploreGrants() : Promise.resolve([]),
  ]);
  const realTables: Partial<Record<ProductKey, string[]>> = {};
  for (const table of grants) {
    const product = productOfTable(table.table);
    if (product) (realTables[product] ??= []).push(sqlName(table.table));
  }
  return exploreSettingsView({
    workspaceName: company?.name ?? "this workspace",
    profile: session.user.workspaceProfile,
    enabledFeatures: session.user.enabledFeatures,
    users,
    allowed,
    realTables: ready ? realTables : null,
    runs: runs.today,
    month: runs.month,
    runLog: ready,
    canChange: isOrgAdminRole(session.user.role),
  });
}

/** Management → Explore: who can use it, what each product shows, the guards, and the questions run today. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) return errorResponse("Only owners and managers see who uses Explore", 403);
    return successResponse(await view(session));
  } catch (error) {
    console.error("[API] GET /api/explore/settings error:", error);
    return errorResponse("Could not read Explore's settings");
  }
}

const patchSchema = z.object({ roles: z.array(z.string().min(1).max(40)).max(40) });

/** Who may use Explore, by role. Owners always may. */
export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) return errorResponse("Only owners and managers change who uses Explore", 403);
    const body = patchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Choose the roles", 400);
    const known = new Set(workspaceRoles(session.user.workspaceProfile));
    const unknown = body.data.roles.find((role) => !known.has(role));
    if (unknown) return errorResponse(`${unknown} is not a role in this workspace`, 400);
    await saveExploreRoles(prisma, session.user.companyId, body.data.roles, session.user.id);
    return successResponse(await view(session));
  } catch (error) {
    console.error("[API] PATCH /api/explore/settings error:", error);
    return errorResponse("Who uses Explore did not change");
  }
}
