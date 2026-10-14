import { notFound } from "next/navigation";

import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { ActivityFeed } from "@/components/admin/workspace/activity-feed";
import { WorkspaceRail } from "@/components/admin/workspace/workspace-rail";
import { workspaceActivity } from "@/lib/admin/activity";
import { findWorkspace } from "@/lib/admin/workspaces";

export default async function WorkspaceOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  if (!workspace) notFound();
  const activity = await workspaceActivity(workspace.id);

  return (
    <AdminPage>
      <AdminPageHeader title="Overview" />
      <div className="grid gap-8 pb-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ActivityFeed items={activity} />
        <WorkspaceRail workspace={workspace} />
      </div>
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `${workspace?.name ?? "Workspace"} · Corelith admin` };
}
