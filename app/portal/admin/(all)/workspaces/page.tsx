import Link from "next/link";
import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { Plus } from "@/lib/icons";

export const metadata = { title: "Workspaces · Corelith admin" };

export default async function WorkspacesPage() {
  const operator = await requireOperator();
  return (
    <AdminPage>
      <AdminPageHeader
        title="Workspaces"
        actions={
          operatorCan(operator.role, "workspace.setUp") ? (
            <Link href="/admin/workspaces/new" className="btn btn-primary no-underline">
              <Plus aria-hidden="true" />
              Set up workspace
            </Link>
          ) : null
        }
      />
      <Suspense>
        <AdminList source="admin-workspaces" title="Workspaces" />
      </Suspense>
    </AdminPage>
  );
}
