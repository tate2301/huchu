import { headers } from "next/headers";
import { PageHeading } from "@/components/layout/page-heading";
import { StudentPortalContent } from "@/components/schools/portal/student-portal-content";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";

export default async function StudentPortalPage() {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/student");
  await requirePageAuth({
    pathname: "/portal/student",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Student Portal"
        description="Enrollment, published results, guardians, and boarding visibility."
      />
      <StudentPortalContent />
    </div>
  );
}
