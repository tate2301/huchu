import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ensureCrmDocument, resolveOwnerRef } from "@/lib/books/crm-document-bridge";
import { createInvoiceForLead } from "@/lib/crm/accounting-bridge";
import { getOrCreateApproval } from "@/lib/crm/approvals";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { documentResourceIdsSchema } from "@/lib/crm/resources";
import { prisma } from "@/lib/prisma";
import { crmDocumentLineSchema } from "@/app/api/v2/crm/_helpers";

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
    resourceIds: documentResourceIdsSchema.optional(),
    approvalExpiresInDays: z.number().int().min(1).max(90).optional(),
  })
  .refine((v) => v.lines || v.fromQuotationId, {
    message: "Provide either lines or fromQuotationId",
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
    if (data.fromQuotationId) {
      await ensureCrmDocument(session.user.companyId, data.fromQuotationId);
    }

    const result = await createInvoiceForLead({
      companyId: session.user.companyId,
      userId: session.user.id,
      ...ownerRef,
      lines: data.lines,
      fromQuotationId: data.fromQuotationId,
      currency: data.currency,
      notes: data.notes ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      isDeposit: data.isDeposit ?? false,
      renderTemplateId: data.renderTemplateId ?? null,
      resourceIds: data.resourceIds,
    });

    let approvalToken: string | undefined;
    if (data.sendApproval) {
      const link = await prisma.$transaction((tx) =>
        getOrCreateApproval(tx, {
          companyId: session.user.companyId,
          leadDocumentId: result.leadDocumentId,
          expiresInDays: data.approvalExpiresInDays,
        }),
      );
      approvalToken = link.token;
    }

    return successResponse({ ...result, approvalToken }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/books/crm/[ownerId]/invoice error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to create invoice", 400);
  }
}
