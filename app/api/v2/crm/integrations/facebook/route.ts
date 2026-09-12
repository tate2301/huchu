import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  CONNECTION_CLIENT_SELECT,
  generateCallbackToken,
  generateVerifyToken,
  toClientConnection,
} from "@/lib/crm/facebook/connections";
import { encryptSecret, integrationEncryptionAvailable } from "@/lib/crm/facebook/secrets";
import { CRM_LEAD_CHANNELS } from "@/lib/crm/sources";

import { isCompanyUser, requireCrmCapability } from "../../_helpers";

const createSchema = z.object({
  pageId: z.string().trim().regex(/^\d{5,32}$/, "A Facebook Page id is numeric"),
  pageName: z.string().trim().max(200).optional(),
  appId: z.string().trim().regex(/^\d{5,32}$/, "A Meta app id is numeric"),
  appSecret: z.string().trim().min(16).max(200),
  pageAccessToken: z.string().trim().min(30).max(600),
  formIds: z.array(z.string().trim().regex(/^\d{5,32}$/)).max(50).optional(),
  defaultChannel: z.enum(CRM_LEAD_CHANNELS as [string, ...string[]]).optional(),
  defaultSourceLabel: z.string().trim().max(80).nullable().optional(),
  defaultAssigneeId: z.string().trim().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const connections = await prisma.crmFacebookConnection.findMany({
      where: { companyId: session.user.companyId },
      select: CONNECTION_CLIENT_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return successResponse({
      data: connections.map(toClientConnection),
      // The screen has to be able to say "this deployment cannot store a Page
      // token yet" before somebody types one into a form that will refuse it.
      encryptionConfigured: integrationEncryptionAvailable(),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/integrations/facebook error:", error);
    return errorResponse("Failed to fetch Facebook connections");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const data = createSchema.parse(await request.json());

    if (!(await isCompanyUser(session.user.companyId, data.defaultAssigneeId))) {
      return errorResponse("Default assignee must be a member of this workspace", 400);
    }

    if (!integrationEncryptionAvailable()) {
      return errorResponse(
        "CRM_INTEGRATION_ENCRYPTION_KEY is not set on this deployment, so a Page access token cannot be stored securely.",
        503,
      );
    }

    const existing = await prisma.crmFacebookConnection.findFirst({
      where: { companyId: session.user.companyId, pageId: data.pageId },
      select: { id: true },
    });
    if (existing) {
      return errorResponse("This Facebook Page is already connected. Edit that connection instead.", 409);
    }

    const created = await prisma.crmFacebookConnection.create({
      data: {
        companyId: session.user.companyId,
        callbackToken: generateCallbackToken(),
        verifyToken: generateVerifyToken(),
        pageId: data.pageId,
        pageName: data.pageName ?? undefined,
        appId: data.appId,
        appSecretEnc: encryptSecret(data.appSecret),
        pageAccessTokenEnc: encryptSecret(data.pageAccessToken),
        formIds: data.formIds ?? [],
        defaultChannel: (data.defaultChannel ?? "ADS") as never,
        defaultSourceLabel: data.defaultSourceLabel ?? "Facebook Lead Ads",
        defaultAssigneeId: data.defaultAssigneeId ?? undefined,
        createdById: session.user.id,
      },
      select: CONNECTION_CLIENT_SELECT,
    });

    // Deliberately not verified here. The callback URL and verify token have to
    // exist before they can be pasted into the Meta dashboard, and the Page
    // cannot be subscribed until the app is. Proving the credentials is the
    // separate `/verify` step, pressed once the Meta side is set up.
    return successResponse(toClientConnection(created), 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/integrations/facebook error:", error);
    return errorResponse("Failed to create Facebook connection");
  }
}
