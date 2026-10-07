import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reportCatalog, reportMeta } from "@/lib/reports/catalog";
import { customReportInputSchema, documentFromReport, starterDocument } from "@/lib/reports/custom/document";
import { readableSources, readerOf } from "@/lib/reports/custom/sources";
import { createCustomReport, listCustomReports, readCustomReport, ShareRefused } from "@/lib/reports/custom/store";
import { customTemplate, templatesFor } from "@/lib/reports/custom/templates";
import { readReportSetting } from "@/lib/reports/settings";

/**
 * A new report: from nothing but a title, from a report's own page, from a
 * built-in custom report (by key), as a copy of one this person can open (by
 * id), or whole. Every new one starts as its maker's alone.
 */
const createSchema = z.union([
  customReportInputSchema,
  z.object({
    title: z.string().trim().min(1).max(120).optional(),
    fromReport: z.string().min(1).max(64).optional(),
    fromTemplate: z.string().min(1).max(64).optional(),
    copyOf: z.string().uuid().optional(),
  }),
]);

/** The custom reports this person can open: their own, and those shared with them. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse({ reports: await listCustomReports(readerOf(sessionResult.session)) });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/custom error:", error);
    return errorResponse("Failed to list custom reports");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That report could not be read", 400);
    const reader = readerOf(session);

    if ("document" in parsed.data) {
      return successResponse({ report: await createCustomReport(reader, parsed.data) }, 201);
    }

    const { fromReport, fromTemplate, copyOf, title } = parsed.data;
    if (copyOf) {
      const original = await readCustomReport(reader, copyOf);
      if (!original) return errorResponse("Report not found", 404);
      const report = await createCustomReport(reader, {
        title: title ?? `${original.title} (copy)`,
        description: original.description,
        audience: "JUST_ME",
        document: original.document,
      });
      return successResponse({ report }, 201);
    }

    const sources = await readableSources(session);
    if (fromTemplate) {
      // Only a built-in this person is offered: its audience includes them and they read every source it reads.
      const template = customTemplate(fromTemplate);
      const offered = templatesFor(sources, { id: session.user.id, role: session.user.role }, null);
      if (!template || !offered.some((entry) => entry.key === template.key)) return errorResponse("Template not found", 404);
      const report = await createCustomReport(reader, {
        title: title ?? template.title,
        description: template.description,
        audience: "JUST_ME",
        document: template.document,
      });
      return successResponse({ report }, 201);
    }
    if (fromReport) {
      // Only a report this person can open can be copied, and it is copied as
      // the workspace has it arranged.
      const definition = sources.find((source) => source.key === fromReport);
      if (!definition) return errorResponse("Report not found", 404);
      const saved = await readReportSetting(session.user.companyId, fromReport);
      const meta = reportMeta(definition, session.user.role, definition.params, saved);
      const report = await createCustomReport(reader, {
        // Its own name, so it is not mistaken for the report it was built from.
        title: title ?? `${definition.title} (copy)`,
        description: null,
        audience: "JUST_ME",
        document: documentFromReport(meta),
      });
      return successResponse({ report }, 201);
    }

    const catalog = reportCatalog(
      sources,
      { role: session.user.role, enabledFeatures: session.user.enabledFeatures },
      session.user.workspaceProfile,
    );
    const firstKey = catalog[0]?.reports[0]?.key;
    const firstSource = sources.find((source) => source.key === firstKey);
    const report = await createCustomReport(reader, {
      title: title ?? "Untitled report",
      description: null,
      audience: "JUST_ME",
      // The first report the catalogue would show this workspace, not the first one defined.
      document: starterDocument(firstSource ?? null),
    });
    return successResponse({ report }, 201);
  } catch (error) {
    if (error instanceof ShareRefused) return errorResponse(error.message, 403);
    console.error("[API] POST /api/v2/reports/custom error:", error);
    return errorResponse("Failed to create the report");
  }
}
