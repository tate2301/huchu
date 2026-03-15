import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getComputedWorkspaceHomeHref } from "@/lib/workspaces";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  redirect(
    getComputedWorkspaceHomeHref({
      role: session.user.role,
      enabledFeatures: session.user.enabledFeatures,
      workspaceProfile: session.user.workspaceProfile,
    }),
  );
}
