import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { findDeviceByKey } from "@/lib/retail/devices";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

/** Price check works before pairing (10-setup W-04 step 5); everything else on the till needs one. */
const WORKS_UNPAIRED = new Set(["/portal/pos/price-check"]);

export async function PosPortalAuthGuard({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  const session = await requirePageAuth({
    pathname,
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });
  if (!canAccessPosPortal(session.user.role)) {
    redirect("/access-blocked");
  }
  if (!WORKS_UNPAIRED.has(pathname)) {
    const base = portalRouting.isPortalHost ? "" : "/portal/pos";
    const device = await findDeviceByKey((await cookies()).get(DEVICE_COOKIE)?.value);
    if (!device || device.companyId !== session.user.companyId) redirect(`${base}/pair`);
    if (device.unpairedAt) redirect(`${base}/unpaired`);
  }
  return <>{children}</>;
}
