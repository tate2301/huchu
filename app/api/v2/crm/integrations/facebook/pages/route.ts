/**
 * Step three: the Pages this customer can connect, and connecting one.
 *
 * `GET` lists what came back from Facebook, marking any Page already connected
 * — by this workspace or another — so the picker can say why one is not
 * available instead of failing at the click.
 *
 * `POST` stores the chosen Page's token and immediately proves it: the Page is
 * subscribed to the app's `leadgen` field before this returns. That is the step
 * a manual setup forgets, and the reason a Meta dashboard can show a verified
 * webhook while no lead ever arrives.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { FacebookAppConfigError, facebookAppConfig } from "@/lib/crm/facebook/app";
import { clearConnectSession, readConnectSession } from "@/lib/crm/facebook/connect-session";
import { CONNECTION_CLIENT_SELECT, runCheck } from "@/lib/crm/facebook/connections";
import { listAuthorizedPages } from "@/lib/crm/facebook/oauth";
import { encryptSecret } from "@/lib/crm/facebook/secrets";

import { requireCrmCapability } from "../../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pickSchema = z.object({ pageId: z.string().trim().regex(/^\d{5,32}$/) });

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const connect = readConnectSession(request);
    if (!connect || connect.companyId !== session.user.companyId) {
      return errorResponse("That connection has expired. Press Connect Facebook to start again.", 410);
    }

    const pages = await listAuthorizedPages(connect.userToken);
    const taken = await prisma.crmFacebookConnection.findMany({
      where: { pageId: { in: pages.map((page) => page.id) } },
      select: { pageId: true, companyId: true },
    });
    const takenBy = new Map(taken.map((row) => [row.pageId, row.companyId]));

    return successResponse({
      authorizedByName: connect.authorizedByName,
      data: pages.map((page) => {
        const owner = takenBy.get(page.id);
        return {
          id: page.id,
          name: page.name,
          // Never the token. The picker only needs to know which Pages are
          // choosable and why the others are not.
          alreadyConnected: owner === session.user.companyId,
          unavailable: Boolean(owner) && owner !== session.user.companyId,
        };
      }),
    });
  } catch (error) {
    if (error instanceof FacebookAppConfigError) return errorResponse(error.message, 503);
    console.error("[API] GET /api/v2/crm/integrations/facebook/pages error:", error);
    return errorResponse("Could not read your Facebook Pages");
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

    const connect = readConnectSession(request);
    if (!connect || connect.companyId !== session.user.companyId) {
      return errorResponse("That connection has expired. Press Connect Facebook to start again.", 410);
    }

    const { pageId } = pickSchema.parse(await request.json());

    const page = (await listAuthorizedPages(connect.userToken)).find((candidate) => candidate.id === pageId);
    if (!page) {
      return errorResponse("That Page is not one this Facebook account manages.", 400);
    }

    const existing = await prisma.crmFacebookConnection.findUnique({
      where: { pageId },
      select: { id: true, companyId: true },
    });
    if (existing && existing.companyId !== session.user.companyId) {
      // Globally unique by design: a delivery names only its Page, so two
      // workspaces holding one Page would make a lead's owner a coin toss.
      return errorResponse(
        "This Facebook Page is already connected to another workspace. Disconnect it there first.",
        409,
      );
    }

    const pageAccessTokenEnc = encryptSecret(page.accessToken);
    const connection = existing
      ? await prisma.crmFacebookConnection.update({
          // Reconnecting is how an expired token is replaced, so this keeps
          // the row — and its delivery history — and swaps the credential.
          where: { id: existing.id },
          data: {
            pageName: page.name,
            pageAccessTokenEnc,
            authorizedByName: connect.authorizedByName,
            isActive: true,
            lastError: null,
            lastErrorAt: null,
          },
          select: { id: true },
        })
      : await prisma.crmFacebookConnection.create({
          data: {
            companyId: session.user.companyId,
            pageId: page.id,
            pageName: page.name,
            pageAccessTokenEnc,
            authorizedByName: connect.authorizedByName,
            defaultSourceLabel: "Facebook Lead Ads",
            createdById: session.user.id,
          },
          select: { id: true },
        });

    // Subscribe now, while the customer is still watching. A connection that
    // reports success and quietly receives nothing is the failure this whole
    // flow exists to prevent.
    const check = await runCheck(connection.id, page.id, {
      accessToken: page.accessToken,
      appSecret: facebookAppConfig().appSecret,
    });

    const saved = await prisma.crmFacebookConnection.findUniqueOrThrow({
      where: { id: connection.id },
      select: CONNECTION_CLIENT_SELECT,
    });

    const response = successResponse({ data: saved, check }, existing ? 200 : 201);
    clearConnectSession(response);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof FacebookAppConfigError) return errorResponse(error.message, 503);
    console.error("[API] POST /api/v2/crm/integrations/facebook/pages error:", error);
    return errorResponse("Could not connect that Page");
  }
}
