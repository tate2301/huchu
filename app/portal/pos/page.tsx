import { headers } from "next/headers";
import { PageHeading } from "@/components/layout/page-heading";
import { PosPortalContent } from "@/components/retail/portal/pos-portal-content";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

export default async function PosPortalPage() {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  await requirePageAuth({
    pathname: "/portal/pos",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Retail POS"
        description="Sell, hold, and close shifts."
      />
      <PosPortalContent />
    </div>
  );
}
