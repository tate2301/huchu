import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PairDoor } from "@/components/retail/till/door";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { isLiveTill } from "@/lib/retail/devices";
import { canAccessPosPortal, normalizePosCallbackUrl } from "@/lib/retail/pos-host";
import { deviceForPage } from "../device-page";

/**
 * The till has no sign-in page of its own: its door is `/pair`, then "Who is
 * selling?" at a signed-out `/`, or `/unpaired`. This sends whoever lands
 * here (a sign-in redirect, an old bookmark) to the one that fits. Off the POS
 * host there is no till to sign in to, so a device there sees the pair screen,
 * which says to pair on the shop's POS address.
 */
export default async function PosPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const routing = getPortalRequestRouting(hostHeader, "/portal/pos");

  const session = await getCurrentAuthSession();
  if (session?.user) {
    if (!canAccessPosPortal(session.user.role)) redirect("/access-blocked");
    const { callbackUrl } = await searchParams;
    redirect(normalizePosCallbackUrl(normalizeCallbackUrl(callbackUrl, routing.homePath), routing.homePath));
  }

  const { device, base, kora } = await deviceForPage();
  if (routing.isPortalHost) {
    if (device?.unpairedAt) redirect("/unpaired");
    // A signed-out `/` on a till is "Who is selling?" (the proxy rewrites it).
    redirect(isLiveTill(device) ? "/" : "/pair");
  }
  const host = (hostHeader ?? "").split(":")[0] || "This device";
  return <PairDoor base={base} host={host} kora={kora} />;
}
