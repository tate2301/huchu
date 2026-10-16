import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorkspaceFeaturesHeader } from "@/components/admin/features/headers";
import { Sectioned } from "@/components/admin/features/section-tabs";
import { AddVerticalButton } from "@/components/admin/features/vertical-dialog";
import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage } from "@/components/admin/page-header";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

/** A workspace's verticals: what it pays for, each turning its features on. */
export default async function WorkspaceVerticalsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [operator, workspace] = await Promise.all([requireOperator(), findWorkspace(slug)]);
  if (!workspace) notFound();
  const held = operatorCan(operator.role, "workspace.edit")
    ? (await prisma.companyVertical.findMany({ where: { companyId: workspace.id }, select: { vertical: true } })).map((row) => row.vertical)
    : null;
  return (
    <AdminPage>
      <Sectioned>
        <WorkspaceFeaturesHeader slug={slug} actions={held ? <AddVerticalButton workspaceId={workspace.id} held={held} /> : null} />
        <Suspense>
          <AdminList source="admin-workspace-verticals" title="Verticals" parent={{ key: "w", value: slug }} keepTitle />
        </Suspense>
      </Sectioned>
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Verticals · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
