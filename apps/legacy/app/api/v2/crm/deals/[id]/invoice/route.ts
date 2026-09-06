import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord, canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { createInvoiceForLead } from "@corelithzw/module-crm/accounting-bridge";
import { createOrRotateApproval } from "@corelithzw/module-crm/approvals";
import { crmDocumentLineSchema } from "../../../_helpers";

const bodySchema = z
  .object({
    lines: z.array(crmDocumentLineSchema).min(1).optional(),
    fromQuotationId: z.string().uuid().optional(),
    currency: z.string().trim().max(10).optional(),
    notes: z.string().trim().max(2000).optional(),
    dueDate: z.string().datetime().optional(),
    sendApproval: z.boolean().optional(),
    isDeposit: z.boolean().optional(),
    renderTemplateId: z.string().uuid().optional(),
    approvalExpiresInDays: z.number().int().min(1).max(90).optional(),
  })
  .refine((v) => v.lines || v.fromQuotationId, {
    message: "Provide either lines or fromQuotationId",
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
      return errorResponse("You can only invoice on deals assigned to you", 403);
    }
    // Owning the record is not the same as being allowed to bill against it.
    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const data = bodySchema.parse(await request.json());
    const result = await createInvoiceForLead({
      companyId: session.user.companyId,
      userId: session.user.id,
      dealId: id,
      lines: data.lines,
      fromQuotationId: data.fromQuotationId,
      currency: data.currency,
      notes: data.notes ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      isDeposit: data.isDeposit ?? false,
      renderTemplateId: data.renderTemplateId ?? null,
    });

    let approvalToken: string | undefined;
    if (data.sendApproval) {
      approvalToken = await prisma.$transaction((tx) =>
        createOrRotateApproval(tx, {
          companyId: session.user.companyId,
          leadDocumentId: result.leadDocumentId,
          expiresInDays: data.approvalExpiresInDays,
        }),
      );
    }

    return successResponse({ ...result, approvalToken }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/deals/[id]/invoice error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to create invoice", 400);
  }
}
