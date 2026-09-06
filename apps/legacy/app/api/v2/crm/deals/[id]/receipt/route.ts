import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord, canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { recordReceiptForLead } from "@corelithzw/module-crm/accounting-bridge";

const bodySchema = z.object({
  invoiceDocumentId: z.string().uuid(),
  amount: z.number().finite().positive(),
  method: z.string().trim().min(1).max(40),
  receivedAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const deal = await prisma.crmDeal.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true },
    });
    if (!deal) return errorResponse("Deal not found", 404);
    if (!await canEditRecord(session, deal.assignedToId)) {
      return errorResponse("You can only record payments on deals assigned to you", 403);
    }
    // Owning the record is not the same as being allowed to bill against it.
    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const data = bodySchema.parse(await request.json());
    const result = await recordReceiptForLead({
      companyId: session.user.companyId,
      userId: session.user.id,
      dealId: id,
      invoiceDocumentId: data.invoiceDocumentId,
      amount: data.amount,
      method: data.method,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : null,
      reference: data.reference ?? null,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/deals/[id]/receipt error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to record receipt", 400);
  }
}
