import { headers } from "next/headers";

import { ParentPortalProvider } from "@/components/schools/portal/parent/parent-portal-context";
import { ParentPortalShell } from "@/components/schools/portal/parent/parent-portal-shell";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { loadParentHousehold, type ParentHousehold } from "@/lib/schools/parent-household-loader";
import { serializeDecimals } from "@/lib/serialize-decimals";

/**
 * Everything under `/portal/parent` gets the portal's own mobile shell.
 *
 * The guard is here so a new screen cannot be added unguarded, and the household
 * is read here, on the server, from the signed-in user — never from anything the
 * URL says. The shell then paints rather than fetches, so a parent never sees a
 * frame of somebody else's empty state.
 */
export default async function ParentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/parent");
  const session = await requirePageAuth({
    pathname: "/portal/parent",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  const household = await loadParentHousehold({
    companyId: session.user.companyId,
    userId: session.user.id,
    role: session.user.role,
  });

  return (
    <ParentPortalProvider household={serializeDecimals(household) as ParentHousehold}>
      <ParentPortalShell>{children}</ParentPortalShell>
    </ParentPortalProvider>
  );
}
