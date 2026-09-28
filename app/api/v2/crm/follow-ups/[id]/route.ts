import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import { isCompanyUser } from "../../_helpers";

const updateSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().optional(),
  assignedToId: z.string().uuid().optional(),
});

/** One follow-up, for its own page, with the records it was raised about. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const followUp = await prisma.crmFollowUp.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        lead: { select: { id: true, leadNo: true, title: true } },
        deal: { select: { id: true, dealNo: true, title: true } },
        client: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentNo: true, title: true, scheduledStart: true } },
      },
    });
    if (!followUp) return errorResponse("Follow-up not found", 404);

    return successResponse({ followUp, mayEdit: await canEditRecord(session, followUp.assignedToId) });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/follow-ups/[id] error:", error);
    return errorResponse("Failed to load the follow-up");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmFollowUp.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true },
    });
    if (!existing) return errorResponse("Follow-up not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit follow-ups assigned to you", 403);
    }

    const data = updateSchema.parse(await request.json());
    if (!(await isCompanyUser(session.user.companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    const updated = await prisma.crmFollowUp.update({
      where: { id },
      data: {
        status: data.status,
        title: data.title,
        notes: data.notes ?? undefined,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        assignedToId: data.assignedToId,
        completedAt: data.status === "COMPLETED" ? new Date() : data.status ? null : undefined,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/follow-ups/[id] error:", error);
    return errorResponse("Failed to update follow-up");
  }
}
