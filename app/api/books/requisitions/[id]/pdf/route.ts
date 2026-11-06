import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { attachmentDisposition, renderDocumentSync } from "@/lib/documents/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const searchParams = new URL(request.url).searchParams;
    const forceDownload =
      searchParams.get("download") === "1" ||
      searchParams.get("disposition") === "attachment";

    const rendered = await renderDocumentSync(session.user.companyId, {
      target: "RECORD",
      sourceKey: "accounting.purchase.requisition",
      recordId: id,
      format: "pdf",
      mode: "SYNC",
    });

    const disposition = forceDownload
      ? attachmentDisposition(rendered.fileName)
      : `inline; filename="${rendered.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"`;

    return new Response(new Uint8Array(rendered.data), {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/books/requisitions/[id]/pdf error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to render the requisition PDF",
      500,
    );
  }
}
