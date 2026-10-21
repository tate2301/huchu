import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { InviteLinkPage } from "@/components/user-management/invite-link-page";
import { authOptions } from "@/lib/auth";
import { requirePreferencesAccess } from "@/lib/preferences/server";
import { loadInviteLinks } from "@/lib/teams/join-view";
import { loadMembersPage, resolveViewer } from "@/lib/teams/members-view";

export default async function PreferencesInviteLinkPage() {
  await requirePreferencesAccess("users");
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  if (!user?.id || !user.companyId) redirect("/login");
  const viewer = await resolveViewer(user.companyId, user.id);
  if (!viewer || !(viewer.isOwner || viewer.isAdmin)) redirect("/preferences/organization/users");
  const page = await loadMembersPage(user.companyId, viewer);
  const links = await loadInviteLinks(user.companyId, page.jobs.filter((job) => viewer.isOwner || job.value !== "SUPERADMIN"));
  return <InviteLinkPage seats={page.seats} links={links} company={page.company.name} />;
}
