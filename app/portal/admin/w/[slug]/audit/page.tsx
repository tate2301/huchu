import { notFound } from "next/navigation";

import { AuditView } from "@/components/admin/audit/audit-view";
import { findWorkspace } from "@/lib/admin/workspaces";

export default async function WorkspaceAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; before?: string }>;
}) {
  const [{ slug }, { tab, before }] = await Promise.all([params, searchParams]);
  const workspace = await findWorkspace(slug);
  if (!workspace) notFound();
  return (
    <AuditView
      basePath={`/admin/w/${slug}/audit`}
      companyId={workspace.id}
      tab={tab}
      before={before}
      description={`What happened in ${workspace.name}, by its members and by Corelith staff, newest first.`}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Audit log · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
