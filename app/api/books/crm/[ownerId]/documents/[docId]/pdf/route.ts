import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { renderMoneyPdfResponse } from "@/lib/books/pdf-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ownerId: string; docId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { docId } = await params;

    return renderMoneyPdfResponse(request, session.user.companyId, docId);
  } catch (error) {
    console.error("[API] GET /api/books/crm/[ownerId]/documents/[docId]/pdf error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to render PDF",
      500,
    );
  }
}
