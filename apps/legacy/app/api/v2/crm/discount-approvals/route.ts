import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { emitCrmNotification, getCrmManagerRecipients } from "@/lib/notifications";

const requestSchema = z.object({
  documentId: z.string().uuid(),
  discountPercent: z.number().finite().min(0).max(100),
  discountAmount: z.number().finite().nonnegative(),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const approvals = await prisma.crmDiscountApproval.findMany({
      where: {
        companyId: session.user.companyId,
        ...(status === "PENDING" || status === "APPROVED" || status === "DECLINED"
          ? { status }
          : {}),
      },
      include: {
        requestedBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
        document: {
          select: {
            id: true,
            type: true,
            amount: true,
            currency: true,
            leadId: true,
            dealId: true,
            quotation: { select: { quotationNumber: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    return successResponse({ data: approvals });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/discount-approvals error:", error);
    return errorResponse("Failed to fetch discount approvals");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = requestSchema.parse(await request.json());

    const document = await prisma.crmLeadDocument.findFirst({
      where: { id: data.documentId, companyId },
      select: { id: true, leadId: true, dealId: true, currency: true },
    });
    if (!document) return errorResponse("Document not found", 404);

    // One open request per document — asking twice just splits the answer.
    const open = await prisma.crmDiscountApproval.findFirst({
      where: { companyId, documentId: data.documentId, status: "PENDING" },
      select: { id: true },
    });
    if (open) return errorResponse("There's already a request waiting on this quote", 409);

    const approval = await prisma.crmDiscountApproval.create({
      data: {
        companyId,
        documentId: data.documentId,
        discountPercent: data.discountPercent,
        discountAmount: data.discountAmount,
        reason: data.reason ?? undefined,
        requestedById: session.user.id,
      },
      include: { requestedBy: { select: { id: true, name: true } } },
    });

    const managers = await getCrmManagerRecipients(companyId, session.user.id);
    await emitCrmNotification({
      companyId,
      recipientIds: managers,
      type: "CRM_DOCUMENT_APPROVED",
      title: `${session.user.name ?? "A rep"} is asking for a ${data.discountPercent}% discount`,
      summary: data.reason ?? "No reason given",
      leadId: document.leadId ?? undefined,
      viewPath: document.dealId
        ? `/crm/deals/${document.dealId}`
        : `/crm/leads/${document.leadId}`,
      severity: "WARNING",
    });

    return successResponse(approval, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/discount-approvals error:", error);
    return errorResponse("Failed to request approval");
  }
}
