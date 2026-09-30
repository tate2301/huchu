import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { facebookAppConfigured } from "@/lib/crm/facebook/app";
import { CONNECTION_CLIENT_SELECT } from "@/lib/crm/facebook/connections";
import { integrationEncryptionAvailable } from "@/lib/crm/facebook/secrets";

import { requireCrmCapability } from "../../_helpers";

/**
 * The connected Pages, and whether this deployment can connect another.
 *
 * There is no POST here: a connection is created by the OAuth flow, which is
 * the whole point — a customer never types a credential, so there is no body
 * for them to send. See `connect/`, `callback/` and `pages/`.
 */
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
      data: connections,
      // The screen asks before it draws the button: a Connect that leads to a
      // 503 is worse than an honest "not set up on this deployment yet".
      available: facebookAppConfigured() && integrationEncryptionAvailable(),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/integrations/facebook error:", error);
    return errorResponse("Failed to fetch Facebook connections");
  }
}
