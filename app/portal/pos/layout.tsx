import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PosPortalProvider } from "@/components/retail/portal/pos-portal-state";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

export default async function PosPortalLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");

  return <PosPortalProvider isPosHost={portalRouting.isPortalHost}>{children}</PosPortalProvider>;
}
