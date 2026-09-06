import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@corelithzw/platform/api-utils";
import { getDocumentBranding } from "@corelithzw/module-documents/branding-snapshot";
import { renderDocumentHtml } from "@corelithzw/module-documents/html-renderer";
import { getSamplePayload } from "@corelithzw/module-documents/sample-payloads";
import { templateSchema } from "@corelithzw/module-documents/template-schema";

const bodySchema = z.object({
  sourceKey: z.string().min(1).max(120),
  schema: z.unknown(),
});

/**
 * Render a template's live preview as HTML using the caller's real branding
 * and a representative sample payload for the source. Consumed by the
 * template editor's preview iframe.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = bodySchema.parse(await request.json());
    const parsedSchema = templateSchema.parse(body.schema ?? {});
    const branding = await getDocumentBranding(session.user.companyId);
    const payload = getSamplePayload(body.sourceKey);

    const html = renderDocumentHtml({ payload, branding, template: parsedSchema });
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // The preview renders inside a sandboxed iframe only.
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/document-templates/preview error:", error);
    return errorResponse("Failed to render preview");
  }
}
