import { redirect } from "next/navigation";

import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { getComputedWorkspaceHomeHref } from "@/lib/workspaces";

/**
 * The site root of a Campus host is the workspace: a signed-in person lands
 * on their home, a signed-out visitor at sign-in. The product's public site is
 * its own project on the bare domain; this host serves the schools.
 */
export default async function RootPage() {
  const session = await getCurrentAuthSession();
  if (session?.user) {
    redirect(
      getComputedWorkspaceHomeHref({
        role: session.user.role,
        enabledFeatures: session.user.enabledFeatures,
        workspaceProfile: session.user.workspaceProfile,
      }),
    );
  }
  redirect("/login");
}
