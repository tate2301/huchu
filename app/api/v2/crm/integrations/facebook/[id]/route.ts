import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { CONNECTION_CLIENT_SELECT, toClientConnection } from "@/lib/crm/facebook/connections";
import { encryptSecret, integrationEncryptionAvailable } from "@/lib/crm/facebook/secrets";
import { CRM_LEAD_CHANNELS } from "@/lib/crm/sources";

import { isCompanyUser, requireCrmCapability } from "../../../_helpers";

const updateSchema = z.object({
  pageName: z.string().trim().max(200).nullable().optional(),
  appId: z.string().trim().regex(/^\d{5,32}$/).optional(),
  /** Omitted leaves the stored secret alone; there is no way to read one back,
   *  so an edit that does not mean to rotate must not have to resend it. */
  appSecret: z.string().trim().min(16).max(200).optional(),
  pageAccessToken: z.string().trim().min(30).max(600).optional(),
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

    const rotating = data.appSecret !== undefined || data.pageAccessToken !== undefined;
    if (rotating && !integrationEncryptionAvailable()) {
      return errorResponse("CRM_INTEGRATION_ENCRYPTION_KEY is not set on this deployment.", 503);
    }

    const updated = await prisma.crmFacebookConnection.update({
      where: { id },
      data: {
        pageName: data.pageName === undefined ? undefined : data.pageName,
        appId: data.appId,
        ...(data.appSecret !== undefined ? { appSecretEnc: encryptSecret(data.appSecret) } : {}),
        ...(data.pageAccessToken !== undefined
          ? { pageAccessTokenEnc: encryptSecret(data.pageAccessToken) }
          : {}),
        formIds: data.formIds,
        defaultChannel: data.defaultChannel as never,
        defaultSourceLabel: data.defaultSourceLabel === undefined ? undefined : data.defaultSourceLabel,
        defaultAssigneeId: data.defaultAssigneeId === undefined ? undefined : data.defaultAssigneeId,
        isActive: data.isActive,
        // A new credential invalidates whatever the last failure said about
        // the old one, and leaving it on screen reads as "still broken".
        ...(rotating ? { lastError: null, lastErrorAt: null } : {}),
      },
      select: CONNECTION_CLIENT_SELECT,
    });

    return successResponse(toClientConnection(updated));
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
