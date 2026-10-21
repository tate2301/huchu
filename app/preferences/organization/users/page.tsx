import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { MembersPage } from "@/components/user-management/members-page";
import { authOptions } from "@/lib/auth";
import { requirePreferencesAccess } from "@/lib/preferences/server";
import { loadMembersPage, resolveViewer } from "@/lib/teams/members-view";

export default async function PreferencesUsersPage() {
  await requirePreferencesAccess("users");
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  if (!user?.id || !user.companyId) redirect("/login");
  const viewer = await resolveViewer(user.companyId, user.id);
  if (!viewer) redirect("/preferences/profile");
  return <MembersPage page={await loadMembersPage(user.companyId, viewer)} />;
}
