import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { Plus } from "@/lib/icons";

export default async function WorkspaceSitesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [operator, workspace] = await Promise.all([requireOperator(), findWorkspace(slug)]);
  if (!workspace) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        title="Sites"
        actions={
          operatorCan(operator.role, "workspace.edit") ? (
            <Link href={`/admin/w/${slug}/sites?sheet=site-add`} scroll={false} className="btn btn-primary no-underline">
              <Plus aria-hidden="true" />
              Add site
            </Link>
          ) : null
        }
      />
      <Suspense>
        <AdminList source="admin-sites" title="Sites" parent={{ key: "w", value: slug }} keepTitle />
      </Suspense>
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Sites · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
