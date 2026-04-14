import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

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
  return <>{children}</>;
}
