import { headers } from "next/headers";
import {
  TeacherPortalProvider,
  type TeacherDay,
} from "../../../../components/portal/teacher/teacher-portal-context";
import { TeacherPortalShell } from "../../../../components/portal/teacher/teacher-portal-shell";
import { requirePageAuth } from "@corelithzw/platform/auth-core/guards";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@corelithzw/platform/tenant";
import { loadTeacherDay } from "../../../../teacher-day-loader";
import { serializeDecimals } from "@corelithzw/platform/serialize-decimals";

/**
 * Everything under `/portal/teacher` gets the portal's own shell.
 *
 * The guard lives here rather than on each page so a new screen cannot be
 * added unguarded, and `AppShell` renders once for the whole portal so moving
 * between screens does not rebuild the rail.
 *
 * The teacher's day is loaded here, on the server, and handed to the client
 * provider as its starting data. Two reasons. The rail is the portal's spine,
 * and a version of it that arrives a render later flashes "no classes" at
 * somebody who has six. And a client query mounted in a *layout* was not
 * re-rendering when it resolved — the request came back 200 with the right
 * body and the screen stayed on its skeleton, because the observer's
 * notification never reached React. Loading on the server sidesteps a class of
 * problem the portal's spine should not be exposed to.
 */
export default async function TeacherPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/teacher");
  const session = await requirePageAuth({
    pathname: "/portal/teacher",
    callbackUrl: portalRouting.callbackPath,
    loginPath: portalRouting.loginPath,
  });

  const day = await loadTeacherDay({
    companyId: session.user.companyId,
    userId: session.user.id,
  });

  return (
    <TeacherPortalProvider initialDay={serializeDecimals(day) as TeacherDay}>
      <TeacherPortalShell>{children}</TeacherPortalShell>
    </TeacherPortalProvider>
  );
}
