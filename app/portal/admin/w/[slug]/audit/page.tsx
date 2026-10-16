import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { findWorkspace } from "@/lib/admin/workspaces";

export default async function WorkspaceAuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workspace = await findWorkspace(slug);
  if (!workspace) notFound();
  return (
    <AdminPage>
      <AdminPageHeader title="Audit log" />
      <p className="-mt-2 mb-3 t-body-sm text-[var(--text-muted)]">
        What happened in {workspace.name}, by its members and by Corelith staff, newest first.
      </p>
      <Suspense>
        <AdminList source="admin-workspace-audit" title="Audit log" parent={{ key: "w", value: slug }} keepTitle />
      </Suspense>
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Audit log · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
