import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { renderMoneyPdfResponse } from "@/lib/books/pdf-response";

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
    return await renderMoneyPdfResponse(request, session.user.companyId, id, "INVOICE");
  } catch (error) {
    console.error("[API] GET /api/books/invoices/[id]/pdf error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to render the invoice PDF",
      500,
    );
  }
}
