import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { CRM_DOCUMENT_SOURCE_KEYS } from "@/lib/crm/document-sources";
import { renderDocumentPreview } from "@/lib/documents/service";
import { templateSchema } from "@/lib/documents/template-schema";
import { prisma } from "@/lib/prisma";

/**
 * A quote, invoice or receipt as it prints, as HTML for its page's preview:
 * the same source, layout and branding as its PDF, without starting Chromium.
 * `?templateId=` previews it in another layout before the choice is saved.
 *
 * Served sandboxed: the page shows it in a frame, and nothing in it may run.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const doc = await prisma.crmLeadDocument.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { type: true, quotationId: true, invoiceId: true, receiptId: true, renderTemplateId: true },
    });
    if (!doc) return errorResponse("Document not found", 404);
    const recordId = doc.quotationId ?? doc.invoiceId ?? doc.receiptId;
    if (!recordId) return errorResponse("Document has no underlying record", 404);

    const html = await renderDocumentPreview(
      session.user.companyId,
      {
        target: "RECORD",
        sourceKey: CRM_DOCUMENT_SOURCE_KEYS[doc.type],
        recordId,
        templateId: new URL(request.url).searchParams.get("templateId") || doc.renderTemplateId || undefined,
      },
      { actorId: session.user.id },
    );
    return previewResponse(html);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/documents/[id]/preview error:", error);
    return errorResponse("Could not show the document");
  }
}

/** The same, in settings not yet saved: the builder's live preview while a layout is customised. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const doc = await prisma.crmLeadDocument.findFirst({
      where: { id: (await params).id, companyId: session.user.companyId },
      select: { type: true, quotationId: true, invoiceId: true, receiptId: true },
    });
    if (!doc) return errorResponse("Document not found", 404);
    const recordId = doc.quotationId ?? doc.invoiceId ?? doc.receiptId;
    if (!recordId) return errorResponse("Document has no underlying record", 404);
    const body = z.object({ schema: templateSchema }).safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse("Those layout settings are not right", 400, body.error.issues);
    const html = await renderDocumentPreview(
      session.user.companyId,
      { target: "RECORD", sourceKey: CRM_DOCUMENT_SOURCE_KEYS[doc.type], recordId, schema: body.data.schema },
      { actorId: session.user.id },
    );
    return previewResponse(html);
  } catch (error) {
    console.error("[API] POST /api/v2/crm/documents/[id]/preview error:", error);
    return errorResponse("Could not show the document");
  }
}

/** The preview's HTML, held to the frame it is shown in: no script, no forms, its own origin. */
function previewResponse(html: string) {
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline' https:; font-src https: data:",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
