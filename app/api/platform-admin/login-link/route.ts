import { NextResponse } from "next/server";
import { isAdminPortalHost } from "@/lib/admin-portal";
import { requestAdminMagicLink } from "@/lib/admin-portal/auth";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

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
  try {
    const body = (await request.json()) as { callbackUrl?: string } | null;
    callbackUrl = normalizeCallbackUrl(body?.callbackUrl, "/admin/dashboard");
  } catch {
    callbackUrl = "/admin/dashboard";
  }

  try {
    const origin = new URL(request.url).origin;
    await requestAdminMagicLink({ origin, callbackUrl });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send admin sign-in link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
