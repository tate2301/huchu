import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";
import { generateBriefToken } from "@corelithzw/module-crm/visit-brief";

/**
 * Share a visit, or stop sharing it.
 *
 * POST mints a token (rotating any existing one, which is what revoking a
 * forwarded link looks like). DELETE clears it, so the page 404s from then on.
 */
const shareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

async function editableVisit(companyId: string, id: string) {
  return prisma.crmAppointment.findFirst({
    where: { id, companyId },
    select: { id: true, assignedToId: true },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const visit = await editableVisit(session.user.companyId, id);
    if (!visit) return errorResponse("Visit not found", 404);
    if (!(await canEditRecord(session, visit.assignedToId))) {
      return errorResponse("You can only share visits assigned to you", 403);
    }

    const body = await request.json().catch(() => ({}));
    const data = shareSchema.parse(body ?? {});

    // Rotating rather than reusing: sharing again is also how somebody takes
    // back a link they sent to the wrong number.
    const token = generateBriefToken();
    await prisma.crmAppointment.update({
      where: { id },
      data: {
        briefToken: token,
        briefSharedAt: new Date(),
        briefExpiresAt: data.expiresInDays
          ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
          : null,
      },
    });

    return successResponse({ token, path: `/v/${token}` }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/appointments/[id]/brief error:", error);
    return errorResponse("Failed to share the visit");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const visit = await editableVisit(session.user.companyId, id);
    if (!visit) return errorResponse("Visit not found", 404);
    if (!(await canEditRecord(session, visit.assignedToId))) {
      return errorResponse("You can only change visits assigned to you", 403);
    }

    await prisma.crmAppointment.update({
      where: { id },
      data: { briefToken: null, briefSharedAt: null, briefExpiresAt: null },
    });

    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/appointments/[id]/brief error:", error);
    return errorResponse("Failed to stop sharing the visit");
  }
}
