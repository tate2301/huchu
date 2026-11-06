import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { canRenderPayslip, HR_DOCUMENT_ACCESS } from "@/lib/documents/hr-sources";
import { attachmentDisposition, renderDocumentSync } from "@/lib/documents/service";
import { hasFeature } from "@/lib/platform/features";
import { isApproverRole } from "@/lib/workflow/approvals";

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

    const decision = await canRenderPayslip({
      companyId: session.user.companyId,
      lineItemId: id,
      userId: session.user.id,
      hasPayrollAccess:
        isApproverRole(session.user.role) &&
        (await hasFeature(session.user.companyId, HR_DOCUMENT_ACCESS["hr.payslip"].feature)),
    });
    if (!decision.allowed) {
      return errorResponse(decision.reason, 404);
    }

    const searchParams = new URL(request.url).searchParams;
    const forceDownload =
      searchParams.get("download") === "1" ||
      searchParams.get("disposition") === "attachment";

    const rendered = await renderDocumentSync(session.user.companyId, {
      target: "RECORD",
      sourceKey: "hr.payslip",
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
    console.error("[API] GET /api/payroll/payslips/[id]/pdf error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to render the payslip PDF",
      500,
    );
  }
}
