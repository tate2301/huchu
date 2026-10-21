import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { MemberPageView } from "@/components/user-management/member-page";
import { authOptions } from "@/lib/auth";
import { requirePreferencesAccess } from "@/lib/preferences/server";
import { loadMemberPage, resolveViewer } from "@/lib/teams/members-view";

export default async function PreferencesUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePreferencesAccess("users");
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  if (!user?.id || !user.companyId) redirect("/login");
  const viewer = await resolveViewer(user.companyId, user.id);
  if (!viewer) redirect("/preferences/profile");
  const page = await loadMemberPage(user.companyId, viewer, id);
  if (!page) notFound();
  return <MemberPageView page={page} />;
}
