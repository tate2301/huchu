import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { canReadReport } from "@/lib/reports/access";
import { reportMeta } from "@/lib/reports/catalog";
import { defaultLayout, fitLayout, reportLayoutSchema } from "@/lib/reports/layout";
import { getReportDefinition } from "@/lib/reports/registry";
import { readReportSetting, saveReportSetting } from "@/lib/reports/settings";
import { reportViewSchema } from "@/lib/reports/view";

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    layout: reportLayoutSchema.nullable().optional(),
    view: reportViewSchema.nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to change" });

async function authorise(request: NextRequest, key: string) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return sessionResult;
  const { session } = sessionResult;
  if (!isOrgAdminRole(session.user.role)) return errorResponse("Only managers set up reports", 403);
  const definition = getReportDefinition(key);
  // A report this person cannot read is not one they can set up either.
  if (!definition || !canReadReport(definition, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
    return errorResponse("Report not found", 404);
  }
  return { session, definition };
}

/** A report's setup: how it is laid out and viewed now, and what it comes with. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const auth = await authorise(request, key);
    if (auth instanceof NextResponse) return auth;
    const { session, definition } = auth;
    const saved = await readReportSetting(session.user.companyId, key);
    return successResponse({
      report: reportMeta(definition, session.user.role, definition.params, saved),
      enabled: saved?.enabled ?? true,
      arranged: Boolean(saved?.layout),
      viewSaved: Boolean(saved?.view),
      /** What "reset" goes back to. */
      ownLayout: fitLayout(definition.layout ?? defaultLayout(definition), definition.columns),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/[key]/settings error:", error);
    return errorResponse("Failed to load the report's setup");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const auth = await authorise(request, key);
    if (auth instanceof NextResponse) return auth;
    const { session, definition } = auth;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That change could not be read", 400);
    const { layout, ...rest } = parsed.data;
    // Stored fitted, so a layout naming a column the report does not have never lands.
    const saved = await saveReportSetting(
      session.user.companyId,
      key,
      { ...rest, ...(layout !== undefined ? { layout: layout === null ? null : fitLayout(layout, definition.columns) } : {}) },
      session.user.id,
    );
    return successResponse({ enabled: saved.enabled, arranged: Boolean(saved.layout), viewSaved: Boolean(saved.view) });
  } catch (error) {
    console.error("[API] PATCH /api/v2/reports/[key]/settings error:", error);
    return errorResponse("Failed to save the report's setup");
  }
}
