import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ensureCrmDocument, resolveOwnerRef } from "@/lib/books/crm-document-bridge";
import { recordReceiptForLead } from "@/lib/crm/accounting-bridge";
import { canUser, denialMessage } from "@/lib/crm/permissions";

const bodySchema = z.object({
  invoiceDocumentId: z.string().uuid(),
  amount: z.number().finite().positive(),
  method: z.string().trim().min(1).max(40),
  receivedAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional(),
  bankAccountId: z.string().uuid().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ownerId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { ownerId } = await params;

    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const ownerRef = await resolveOwnerRef(session.user.companyId, ownerId);
    if (!ownerRef) return errorResponse("Record not found", 404);

    const data = bodySchema.parse(await request.json());
    const ensuredInvoiceDoc = await ensureCrmDocument(
      session.user.companyId,
      data.invoiceDocumentId,
    );
    if (!ensuredInvoiceDoc) return errorResponse("Invoice document not found", 404);

    const result = await recordReceiptForLead({
      companyId: session.user.companyId,
      userId: session.user.id,
      ...ownerRef,
      invoiceDocumentId: ensuredInvoiceDoc.id,
      amount: data.amount,
      method: data.method,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : null,
      reference: data.reference ?? null,
      bankAccountId: data.bankAccountId ?? null,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/books/crm/[ownerId]/receipt error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to record receipt", 400);
  }
}
