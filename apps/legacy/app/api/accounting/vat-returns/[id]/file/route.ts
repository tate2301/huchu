import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { parseVatReturnPayload, transitionVatReturnStatus } from "@/lib/accounting/vat-return";

const fileSchema = z.object({
  referenceNumber: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const validated = fileSchema.parse(body);

    const result = await transitionVatReturnStatus({
      companyId: session.user.companyId,
      vatReturnId: id,
      nextStatus: "FILED",
      actorId: session.user.id,
      referenceNumber: validated.referenceNumber,
      notes: validated.notes,
    });

    return successResponse(parseVatReturnPayload(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/vat-returns/[id]/file error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to file VAT return");
  }
}

