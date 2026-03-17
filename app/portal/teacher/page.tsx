import { headers } from "next/headers";
import { PageHeading } from "@/components/layout/page-heading";
import { TeacherPortalContent } from "@/components/schools/portal/teacher-portal-content";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

export default async function TeacherPortalPage() {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/teacher");
  await requirePageAuth({
    pathname: "/portal/teacher",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Teacher Portal"
        description="Moderation queue, sheet progress, and published result visibility."
      />
      <TeacherPortalContent />
    </div>
  );
}
