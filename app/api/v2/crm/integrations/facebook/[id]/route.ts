import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { CONNECTION_CLIENT_SELECT } from "@/lib/crm/facebook/connections";
import { CRM_LEAD_CHANNELS } from "@/lib/crm/sources";

import { isCompanyUser, requireCrmCapability } from "../../../_helpers";

/**
 * Only the settings a person chooses. The Page access token is deliberately
 * not here: it is replaced by reconnecting through Facebook, which is one
 * click and always produces a working token, rather than by pasting a new one.
 */
const updateSchema = z.object({
  formIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(50).optional(),
  defaultChannel: z.enum(CRM_LEAD_CHANNELS as [string, ...string[]]).optional(),
  defaultSourceLabel: z.string().trim().max(80).nullable().optional(),
  defaultAssigneeId: z.string().trim().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const { id } = await params;
    const data = updateSchema.parse(await request.json());

    const existing = await prisma.crmFacebookConnection.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Connection not found", 404);

    if (!(await isCompanyUser(session.user.companyId, data.defaultAssigneeId))) {
      return errorResponse("Default assignee must be a member of this workspace", 400);
    }

    const updated = await prisma.crmFacebookConnection.update({
      where: { id },
      data: {
        formIds: data.formIds,
        defaultChannel: data.defaultChannel as never,
        defaultSourceLabel: data.defaultSourceLabel === undefined ? undefined : data.defaultSourceLabel,
        defaultAssigneeId: data.defaultAssigneeId === undefined ? undefined : data.defaultAssigneeId,
        isActive: data.isActive,
      },
      select: CONNECTION_CLIENT_SELECT,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/integrations/facebook/[id] error:", error);
    return errorResponse("Failed to update Facebook connection");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const { id } = await params;
    const existing = await prisma.crmFacebookConnection.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Connection not found", 404);

    // The delivery ledger survives: it is the record of which leads came from
    // where, and it outlives the credentials that fetched them.
    await prisma.crmFacebookConnection.delete({ where: { id } });

    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/integrations/facebook/[id] error:", error);
    return errorResponse("Failed to delete Facebook connection");
  }
}
