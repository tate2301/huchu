import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { changeDocumentDetails, DocumentDetailsRefused, documentDetailsSchema } from "@/lib/crm/document-details";

/** An invoice's due date, or a receipt's method and reference: what can change once the figures cannot. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const details = documentDetailsSchema.parse(await request.json());
    return successResponse(await changeDocumentDetails(sessionResult.session, (await params).id, details));
  } catch (error) {
    if (error instanceof DocumentDetailsRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/documents/[id]/details error:", error);
    return errorResponse("Could not change the document");
  }
}
