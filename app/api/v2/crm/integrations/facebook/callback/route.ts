/**
 * Step two: Facebook sends the customer back here with an authorisation code.
 *
 * This route does the three Graph API calls a manual setup made somebody run
 * by hand — code to user token, user token extended, Pages listed — then parks
 * the result in a short-lived encrypted cookie and sends the customer to the
 * settings screen to pick a Page.
 *
 * It always redirects, never renders. A customer coming back from Facebook is
 * mid-flow in a browser tab, so every outcome including failure has to land
 * them somewhere with an explanation, not on a JSON blob.
 */
import { NextRequest, NextResponse } from "next/server";

import { validateSession } from "@/lib/api-utils";
import { FacebookAppConfigError, facebookAppConfig } from "@/lib/crm/facebook/app";
import { setConnectSession } from "@/lib/crm/facebook/connect-session";
import {
  exchangeCodeForUserToken,
  extendUserToken,
  fetchAuthorizingUser,
  listAuthorizedPages,
  verifyState,
} from "@/lib/crm/facebook/oauth";
import { absoluteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/crm/settings?tab=facebook";

function back(status: "pick" | "error" | "cancelled", detail?: string): NextResponse {
  const url = new URL(absoluteUrl(SETTINGS_PATH));
  url.searchParams.set("facebook", status);
  if (detail) url.searchParams.set("facebookError", detail.slice(0, 300));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;

  // The customer pressed Cancel on Facebook's permission screen. Not an error
  // — say so plainly and leave everything as it was.
  if (query.get("error")) {
    return back("cancelled", query.get("error_description") ?? undefined);
  }

  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) {
      // Signed out mid-flow. Sending them to the settings screen puts them
      // through the normal login redirect and back to where they were.
      return NextResponse.redirect(absoluteUrl(SETTINGS_PATH));
    }
    const { session } = sessionResult;

    const config = facebookAppConfig();
    const state = verifyState(query.get("state"), config);
    if (!state.ok) {
      return back("error", "That connection link was not valid or has expired. Please try again.");
    }
    if (state.companyId !== session.user.companyId) {
      // The flow was started from a different workspace in this browser.
      return back("error", "That connection was started from another workspace. Please try again.");
    }

    const code = query.get("code");
    if (!code) return back("error", "Facebook did not return an authorisation code.");

    const userToken = await extendUserToken(await exchangeCodeForUserToken(code, config), config);
    const pages = await listAuthorizedPages(userToken);

    if (!pages.length) {
      return back(
        "error",
        "That Facebook account does not manage any Pages. Sign in as someone with full control of the Page and try again.",
      );
    }

    const response = back("pick");
    setConnectSession(response, {
      companyId: session.user.companyId,
      userToken,
      authorizedByName: await fetchAuthorizingUser(userToken),
    });
    return response;
  } catch (error) {
    if (error instanceof FacebookAppConfigError) return back("error", error.message);
    console.error("[API] GET /api/v2/crm/integrations/facebook/callback error:", error);
    return back("error", error instanceof Error ? error.message : "Could not finish connecting to Facebook.");
  }
}
