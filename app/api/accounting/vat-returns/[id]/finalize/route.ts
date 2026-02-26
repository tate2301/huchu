import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { parseVatReturnPayload, transitionVatReturnStatus } from "@/lib/accounting/vat-return";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const result = await transitionVatReturnStatus({
      companyId: session.user.companyId,
      vatReturnId: id,
      nextStatus: "FINALIZED",
      actorId: session.user.id,
    });

    return successResponse(parseVatReturnPayload(result));
  } catch (error) {
    console.error("[API] POST /api/accounting/vat-returns/[id]/finalize error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to finalize VAT return");
  }
}

