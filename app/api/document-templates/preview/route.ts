import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { HR_DOCUMENT_ACCESS, latestPayslipLine, resolvePayslip } from "@/lib/documents/hr-sources";
import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import { applyPayslipRows } from "@/lib/documents/payslip-rows";
import { getSamplePayload } from "@/lib/documents/sample-payloads";
import { templateSchema } from "@/lib/documents/template-schema";
import type { UniversalDocumentPayload } from "@/lib/documents/types";
import { hasFeature } from "@/lib/platform/features";
import { isApproverRole } from "@/lib/workflow/approvals";

const bodySchema = z.object({
  sourceKey: z.string().min(1).max(120),
  schema: z.unknown(),
});

/**
 * Render a template's live preview as HTML using the caller's real branding
 * and a representative sample payload for the source. Consumed by the
 * template editor's preview iframe.
 *
 * A payslip layout shows the workspace's newest payslip when the caller may
 * read anybody's (the render route's bar: a payroll role and payroll), and
 * the source's sample otherwise. `X-Preview-Of` says whose, for the builder's
 * "Showing …" line.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = bodySchema.parse(await request.json());
    const parsedSchema = templateSchema.parse(body.schema ?? {});
    const companyId = session.user.companyId;
    const branding = await getDocumentBranding(companyId);

    let payload: UniversalDocumentPayload = getSamplePayload(body.sourceKey);
    let showing: string | null = null;
    if (body.sourceKey === "hr.payslip") {
      const mayReadAny = isApproverRole(session.user.role) && (await hasFeature(companyId, HR_DOCUMENT_ACCESS["hr.payslip"].feature));
      const latest = mayReadAny ? await latestPayslipLine(companyId) : null;
      if (latest) {
        payload = (await resolvePayslip(companyId, latest.id)).payload;
        showing = `${latest.name}, ${latest.periodEnd.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}`;
      }
      payload = applyPayslipRows(payload, parsedSchema.rows);
    }

    const html = renderDocumentHtml({ payload, branding, template: parsedSchema });
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // The preview renders inside a sandboxed iframe only.
        "X-Frame-Options": "SAMEORIGIN",
        ...(showing ? { "X-Preview-Of": encodeURIComponent(showing) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/document-templates/preview error:", error);
    return errorResponse("Failed to render preview");
  }
}
