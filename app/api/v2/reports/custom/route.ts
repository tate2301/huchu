import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reportMeta } from "@/lib/reports/catalog";
import { customReportInputSchema, documentFromReport, starterDocument } from "@/lib/reports/custom/document";
import { readableSources, readerOf } from "@/lib/reports/custom/sources";
import { createCustomReport, listCustomReports } from "@/lib/reports/custom/store";
import { readReportSetting } from "@/lib/reports/settings";

/** A new report from nothing but a title, or from a report's own page, or whole. */
const createSchema = z.union([
  customReportInputSchema,
  z.object({ title: z.string().trim().min(1).max(120).optional(), fromReport: z.string().min(1).max(64).optional() }),
]);

/** The custom reports this person can open: their own, and every shared one. */
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

    const sources = await readableSources(session);
    const { fromReport, title } = parsed.data;
    if (fromReport) {
      // Only a report this person can open can be copied, and it is copied as
      // the workspace has it arranged.
      const definition = sources.find((source) => source.key === fromReport);
      if (!definition) return errorResponse("Report not found", 404);
      const saved = await readReportSetting(session.user.companyId, fromReport);
      const meta = reportMeta(definition, session.user.role, definition.params, saved);
      const report = await createCustomReport(reader, {
        title: title ?? definition.title,
        description: null,
        shared: false,
        document: documentFromReport(meta),
      });
      return successResponse({ report }, 201);
    }

    const report = await createCustomReport(reader, {
      title: title ?? "Untitled report",
      description: null,
      shared: false,
      document: starterDocument(sources[0] ?? null),
    });
    return successResponse({ report }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/reports/custom error:", error);
    return errorResponse("Failed to create the report");
  }
}
