import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { syncFiscalReceiptStatus } from "@corelithzw/module-books/fiscalisation";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const updated = await syncFiscalReceiptStatus(session.user.companyId, id);

    return successResponse(updated);
  } catch (error) {
    console.error("[API] POST /api/accounting/fiscalisation/receipts/[id]/sync error:", error);
    return errorResponse("Failed to sync fiscal receipt");
  }
}
