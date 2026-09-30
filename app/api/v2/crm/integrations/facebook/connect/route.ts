/**
 * Step one of "Connect Facebook": send the customer to Facebook.
 *
 * A redirect rather than JSON, so the settings panel can point a plain link at
 * it. The `state` carries the workspace, signed, so the callback knows who
 * came back without a row to look it up in.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { FacebookAppConfigError, facebookAppConfig } from "@/lib/crm/facebook/app";
import { authorizeUrl, signState } from "@/lib/crm/facebook/oauth";
import { integrationEncryptionAvailable } from "@/lib/crm/facebook/secrets";

import { requireCrmCapability } from "../../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    if (!integrationEncryptionAvailable()) {
      return errorResponse(
        "CRM_INTEGRATION_ENCRYPTION_KEY is not set on this deployment, so a Facebook access token cannot be stored securely.",
        503,
      );
    }

    const config = facebookAppConfig();
    return NextResponse.redirect(authorizeUrl(signState(session.user.companyId, config), config));
  } catch (error) {
    if (error instanceof FacebookAppConfigError) return errorResponse(error.message, 503);
    console.error("[API] GET /api/v2/crm/integrations/facebook/connect error:", error);
    return errorResponse("Could not start the Facebook connection");
  }
}
