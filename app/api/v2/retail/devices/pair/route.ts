import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { trustedClientAddress } from "@/lib/platform/client-address";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext, resolveTenantFromHost } from "@/lib/platform/tenant";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, INSTALL_COOKIE } from "@/lib/retail/device-words";
import { newInstallId, pairDevice, pairFailure } from "@/lib/retail/devices";

const pairInput = z.object({
  code: z.string({ error: "Type the six digits." }).trim().regex(/^\d{3}\D?\d{3}$/, "Type the six digits."),
});

/**
 * Pair this device (10-setup W-04 step 6). No session: the code is the proof
 * a manager said yes, and the shop is the POS host's. Wrong codes are counted
 * per install, per address and across the shop (`pairDevice`). A device that
 * is already a till is refused. Sets the httpOnly `tender_device` cookie,
 * host-only, and answers `{ till, site }`.
 */
export async function POST(request: NextRequest) {
  const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
  if (getPlatformHostContext(hostHeader).portalCanonicalPrefix !== "pos") {
    return errorResponse("Pair a device on the shop's POS address.", 404);
  }
  const tenant = await resolveTenantFromHost(hostHeader);
  if (!tenant) return errorResponse("Pair a device on the shop's POS address.", 404);

  const parsed = pairInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Type the six digits.";
    return fieldErrorResponse(message, { code: message });
  }

  const cookieInstall = request.cookies.get(INSTALL_COOKIE)?.value;
  const installId = cookieInstall && /^[\w-]{8,64}$/.test(cookieInstall) ? cookieInstall : null;
  const secure = request.nextUrl.protocol === "https:";
  const setInstall = (response: NextResponse) => {
    if (!installId) {
      response.cookies.set(INSTALL_COOKIE, newInstallId(), {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }
    return response;
  };

  try {
    const paired = await pairDevice({
      companyId: tenant.companyId,
      code: parsed.data.code,
      installId,
      address: trustedClientAddress(request.headers),
      deviceKey: request.cookies.get(DEVICE_COOKIE)?.value ?? null,
      userAgent: request.headers.get("user-agent"),
      shell: request.headers.get("x-tender-shell"),
      appVersion: request.headers.get("x-tender-version"),
    });
    const response = NextResponse.json({ till: paired.till, site: paired.site });
    // No Domain: the key goes to the POS host and nowhere else.
    response.cookies.set(DEVICE_COOKIE, paired.key, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
    return setInstall(response);
  } catch (error) {
    return setInstall(pairFailure(error));
  }
}
