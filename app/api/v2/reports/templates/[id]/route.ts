import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { deleteTemplate, readTemplate, templatePatchSchema, updateTemplate } from "@/lib/reports/templates";

type Context = { params: Promise<{ id: string }> };

const REFUSED = {
  403: "Only whoever made it, or a manager once it is shared, can change this template",
  404: "Template not found",
} as const;

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const template = await readTemplate(sessionResult.session, (await params).id);
    if (!template) return errorResponse(REFUSED[404], 404);
    return successResponse({ template });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/templates/[id] error:", error);
    return errorResponse("Failed to load the template");
  }
}

/** Rename, describe, re-share, or re-save its view. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const parsed = templatePatchSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That change could not be read", 400);
    const result = await updateTemplate(sessionResult.session, (await params).id, parsed.data);
    if (!result.ok) return errorResponse(REFUSED[result.status], result.status);
    return successResponse({ template: result.template });
  } catch (error) {
    console.error("[API] PATCH /api/v2/reports/templates/[id] error:", error);
    return errorResponse("Failed to save the template");
  }
}

/** Only the template goes; the report and its rows are untouched. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const result = await deleteTemplate(sessionResult.session, (await params).id);
    if (!result.ok) return errorResponse(REFUSED[result.status], result.status);
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/reports/templates/[id] error:", error);
    return errorResponse("Failed to delete the template");
  }
}
