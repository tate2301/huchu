import { headers } from "next/headers";
import { PageHeading } from "@/components/layout/page-heading";
import { ParentPortalContent } from "@/components/schools/portal/parent-portal-content";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

export default async function ParentPortalPage() {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/parent");
  await requirePageAuth({
    pathname: "/portal/parent",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Parent Portal"
      />
      <ParentPortalContent />
    </div>
  );
}
