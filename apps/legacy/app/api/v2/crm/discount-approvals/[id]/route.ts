import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { emitCrmNotification } from "@/lib/notifications";

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "DECLINED"]),
  decisionNote: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    // The point of the request is that somebody senior answers it.
    if (!hasCrmFullAccess(session.user.role)) {
      return errorResponse("Only a manager can approve a discount", 403);
    }

    const existing = await prisma.crmDiscountApproval.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        requestedById: true,
        discountPercent: true,
        document: { select: { leadId: true, dealId: true } },
      },
    });
    if (!existing) return errorResponse("Request not found", 404);
    if (existing.status !== "PENDING") {
      return errorResponse("That request has already been answered", 409);
    }

    const data = decisionSchema.parse(await request.json());

    const approval = await prisma.crmDiscountApproval.update({
      where: { id },
      data: {
        status: data.decision,
        decidedById: session.user.id,
        decidedAt: new Date(),
        decisionNote: data.decisionNote ?? undefined,
      },
      include: { decidedBy: { select: { id: true, name: true } } },
    });

    const approved = data.decision === "APPROVED";
    await emitCrmNotification({
      companyId,
      recipientIds: [existing.requestedById],
      type: approved ? "CRM_DOCUMENT_APPROVED" : "CRM_DOCUMENT_DECLINED",
      title: approved
        ? `Your ${existing.discountPercent}% discount was approved`
        : `Your ${existing.discountPercent}% discount was declined`,
      summary: data.decisionNote ?? (approved ? "Go ahead and send it" : "No reason given"),
      leadId: existing.document.leadId ?? undefined,
      viewPath: existing.document.dealId
        ? `/crm/deals/${existing.document.dealId}`
        : `/crm/leads/${existing.document.leadId}`,
      severity: approved ? "INFO" : "WARNING",
    });

    return successResponse(approval);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/discount-approvals/[id] error:", error);
    return errorResponse("Failed to record the decision");
  }
}
