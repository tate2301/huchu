import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { requireCrmCapability } from "../../../_helpers";

const bodySchema = z.object({
  action: z.enum(["APPROVE", "MARK_PAID", "VOID", "REOPEN"]),
  notes: z.string().trim().max(500).optional(),
});

const NEXT_STATUS: Record<string, "PENDING" | "APPROVED" | "PAID" | "VOIDED"> = {
  APPROVE: "APPROVED",
  MARK_PAID: "PAID",
  VOID: "VOIDED",
  REOPEN: "PENDING",
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "commissions.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmCommissionEntry.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Commission entry not found", 404);

    const { action, notes } = bodySchema.parse(await request.json());
    const status = NEXT_STATUS[action];

    const updated = await prisma.crmCommissionEntry.update({
      where: { id },
      data: {
        status,
        notes: notes ?? undefined,
        approvedById: action === "APPROVE" ? session.user.id : undefined,
        paidAt: action === "MARK_PAID" ? new Date() : action === "REOPEN" ? null : undefined,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/commissions/entries/[id] error:", error);
    return errorResponse("Failed to update commission entry");
  }
}
