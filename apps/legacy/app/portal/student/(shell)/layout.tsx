import { headers } from "next/headers";
import {
  StudentPortalProvider,
  type StudentDay,
} from "@/components/schools/portal/student/student-portal-context";
import { StudentPortalShell } from "@/components/schools/portal/student/student-portal-shell";
import { requirePageAuth } from "@/lib/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { loadStudentDay } from "@/lib/schools/student-day-loader";
import { serializeDecimals } from "@/lib/serialize-decimals";

/**
 * Everything under `/portal/student` gets the portal's own mobile shell.
 *
 * The guard is here so a new screen cannot be added unguarded, and the pupil's
 * own record is read here, on the server, from the signed-in user — never from
 * anything the URL says. The shell then paints rather than fetches.
 */
export default async function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/student");
  const session = await requirePageAuth({
    pathname: "/portal/student",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  const day = await loadStudentDay({
    companyId: session.user.companyId,
    userId: session.user.id,
  });

  return (
    <StudentPortalProvider day={serializeDecimals(day) as StudentDay}>
      <StudentPortalShell>{children}</StudentPortalShell>
    </StudentPortalProvider>
  );
}
