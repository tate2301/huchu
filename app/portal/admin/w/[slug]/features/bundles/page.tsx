import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorkspaceFeaturesHeader } from "@/components/admin/features/headers";
import { Sectioned } from "@/components/admin/features/section-tabs";
import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage } from "@/components/admin/page-header";
import { findWorkspace } from "@/lib/admin/workspaces";

/** A workspace's bundles: included by its verticals, turned on, or off. */
export default async function WorkspaceBundlesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workspace = await findWorkspace(slug);
  if (!workspace) notFound();
  return (
    <AdminPage>
      <Sectioned>
        <WorkspaceFeaturesHeader slug={slug} />
        <Suspense>
          <AdminList source="admin-workspace-bundles" title="Bundles" parent={{ key: "w", value: slug }} keepTitle />
        </Suspense>
      </Sectioned>
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Bundles · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
