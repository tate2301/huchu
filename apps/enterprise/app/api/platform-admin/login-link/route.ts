import { NextResponse } from "next/server";
import { isAdminPortalHost } from "@corelithzw/platform/admin-portal";
import { requestAdminMagicLink } from "@corelithzw/platform/admin-portal/auth";
import { normalizeCallbackUrl } from "@corelithzw/platform/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@corelithzw/platform/auth-core/strategy-registry";
import { getHostHeaderFromRequestHeaders } from "@corelithzw/platform/tenant";

export async function POST(request: Request) {
  const host = getHostHeaderFromRequestHeaders(request.headers);
  if (!isAdminPortalHost(host)) {
    return NextResponse.json({ error: "Admin sign-in is only available on the admin portal host." }, { status: 403 });
  }

  const strategies = getAuthStrategiesForSurface("admin-login");
  if (!strategies.some((strategy) => strategy.id === "admin-email-link")) {
    return NextResponse.json({ error: "Admin magic-link sign-in is unavailable." }, { status: 403 });
  }

  let callbackUrl = "/admin/dashboard";
  let email = "";
  try {
    const body = (await request.json()) as { callbackUrl?: string; email?: string } | null;
    callbackUrl = normalizeCallbackUrl(body?.callbackUrl, "/admin/dashboard");
    email = body?.email?.trim().toLowerCase() ?? "";
  } catch {
    callbackUrl = "/admin/dashboard";
    email = "";
  }

  try {
    const origin = new URL(request.url).origin;
    await requestAdminMagicLink({ origin, callbackUrl, email });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send admin sign-in link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
