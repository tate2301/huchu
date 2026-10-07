import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TillLockProvider } from "@/components/retail/till/lock";
import { TillShell } from "@/components/retail/till/shell";
import { TillSignOutProvider } from "@/components/retail/till/sign-out";
import { TillStateProvider } from "@/components/retail/till/state";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { isLiveTill } from "@/lib/retail/devices";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { deviceForPage } from "../device-page";

/**
 * The signed-in till. Someone signed out is at the door before this mounts:
 * the proxy shows "Who is selling?" for a signed-out `/`, and `/pair` to a
 * device with no key.
 *
 * Only price check opens on a device that is not a till; the other pages send
 * such a device to `/pair` or `/unpaired`. There the provider leaves the
 * device alone: no till context, no heartbeat, no device watch.
 */
export default async function TillLayout({ children }: { children: ReactNode }) {
  const hostHeader = getHostHeaderFromRequestHeaders(await headers());
  const routing = getPortalRequestRouting(hostHeader, "/portal/pos");
  const session = await requirePageAuth({
    pathname: "/portal/pos",
    callbackUrl: routing.callbackPath,
    loginPath: routing.loginPath,
  });
  if (!canAccessPosPortal(session.user.role)) {
    redirect("/access-blocked");
  }
  const { device } = await deviceForPage();

  return (
    <TillStateProvider isPosHost={routing.isPortalHost} paired={isLiveTill(device)}>
      <TillSignOutProvider>
        {/* The lock covers every screen: a cashier steps away from wherever they were. */}
        <TillLockProvider>
          <TillShell>{children}</TillShell>
        </TillLockProvider>
      </TillSignOutProvider>
    </TillStateProvider>
  );
}
