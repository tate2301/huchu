import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { createTemplate, listTemplates, templateInputSchema } from "@/lib/reports/templates";

/** The templates this person may open, built in reports aside. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse({ templates: await listTemplates(sessionResult.session) });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/templates error:", error);
    return errorResponse("Failed to list report templates");
  }
}

/** Save a report as a template, or start one from a report's own view. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const parsed = templateInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That template could not be read", 400);
    const result = await createTemplate(sessionResult.session, parsed.data);
    if (!result.ok) {
      return result.status === 403
        ? errorResponse("Only managers share templates with others", 403)
        : errorResponse("Report not found", 404);
    }
    return successResponse({ template: result.template }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/reports/templates error:", error);
    return errorResponse("Failed to save the template");
  }
}
