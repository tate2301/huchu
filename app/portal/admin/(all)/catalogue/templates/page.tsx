import { Suspense } from "react";

import { CatalogueHeader } from "@/components/admin/features/headers";
import { Sectioned } from "@/components/admin/features/section-tabs";
import { SyncFromCodeButton } from "@/components/admin/features/sync-button";
import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

export const metadata = { title: "Templates · Catalogue · Corelith admin" };

/**
 * The client templates each vertical is built from: its bundles and what it
 * keeps out. Defined in code; a vertical is added to workspaces from the
 * Workspaces list.
 */
export default async function CatalogueTemplatesPage() {
  const operator = await requireOperator();
  return (
    <AdminPage>
      <Sectioned>
        <CatalogueHeader actions={operatorCan(operator.role, "operator.manage") ? <SyncFromCodeButton /> : null} />
        <Suspense>
          <AdminList source="admin-catalogue-templates" title="Templates" />
        </Suspense>
      </Sectioned>
    </AdminPage>
  );
}
