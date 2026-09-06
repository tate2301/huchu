import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { renderDocumentSync } from "@/lib/documents/service";

export const runtime = "nodejs";

const SOURCE_KEYS = {
  QUOTATION: "accounting.sales.quotation",
  INVOICE: "accounting.sales.invoice",
  RECEIPT: "accounting.sales.receipt",
} as const;

/**
 * Render a lead's quotation, invoice, or receipt as a branded PDF.
 *
 * The equivalent accounting routes sit behind the `accounting.ar` gate — which
 * the platform enforces on the whole `/api/accounting/sales` prefix — so a
 * CRM-only tenant cannot reach them at all. Rather than widening accounting's
 * gate, the CRM serves its own documents: the record is reached through the
 * CrmLeadDocument that links it to this lead, which keeps the tenant and lead
 * scoping explicit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, docId } = await params;
    const forceDownload = new URL(request.url).searchParams.get("download") === "1";

    const doc = await prisma.crmLeadDocument.findFirst({
      where: { id: docId, leadId: id, companyId: session.user.companyId },
      select: { type: true, quotationId: true, invoiceId: true, receiptId: true, renderTemplateId: true },
    });
    if (!doc) return errorResponse("Document not found", 404);

    const recordId = doc.quotationId ?? doc.invoiceId ?? doc.receiptId;
    if (!recordId) return errorResponse("Document has no underlying record", 404);

    const rendered = await renderDocumentSync(session.user.companyId, {
      target: "RECORD",
      sourceKey: SOURCE_KEYS[doc.type],
      recordId,
      format: "pdf",
      mode: "SYNC",
      // The layout chosen when the document was raised. Null falls through to
      // the company default, which is what every document did before layouts
      // could be chosen.
      templateId: doc.renderTemplateId ?? undefined,
    });

    return new Response(new Uint8Array(rendered.data), {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${rendered.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/leads/[id]/documents/[docId]/pdf error:", error);
    return errorResponse("Failed to render the document PDF");
  }
}
