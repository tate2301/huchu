import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";

const issueSchema = z.object({
  invoiceId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = issueSchema.parse(body);

    const result = await issueFiscalReceipt(session.user.companyId, validated.invoiceId, session.user.id);

    if (result.status === "FAILED") {
      return errorResponse(result.error ?? "Failed to issue fiscal receipt", 400);
    }

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/issue error:", error);
    return errorResponse("Failed to issue fiscal receipt");
  }
}
