import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getWorkspaceHomeHref } from "@/lib/workspaces";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  redirect(getWorkspaceHomeHref(session.user.workspaceProfile));
}
