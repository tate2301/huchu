import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { CustomReport } from "@/lib/reports/custom/document";
import { readableSources } from "@/lib/reports/custom/sources";
import { customTemplate, templatesFor } from "@/lib/reports/custom/templates";

/**
 * A built-in custom report, to read: the same shape as one built in the
 * workspace, so the same screen draws it on the reader's own rows. It is
 * nobody's to change; "Make it yours" copies it. 404 when not offered to them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { key } = await params;
    const template = customTemplate(key);
    const offered = templatesFor(await readableSources(session), { id: session.user.id, role: session.user.role }, null);
    if (!template || !offered.some((entry) => entry.key === key)) return errorResponse("Template not found", 404);
    const report: CustomReport = {
      id: `built-${template.key}`,
      title: template.title,
      description: template.description,
      audience: template.audience,
      document: template.document,
      mine: false,
      editable: false,
      canShare: false,
      updatedAt: new Date(0).toISOString(),
    };
    return successResponse({ report, builtIn: template.key });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/built/[key] error:", error);
    return errorResponse("Failed to load the report");
  }
}
