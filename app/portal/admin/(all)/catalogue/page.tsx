import { Suspense } from "react";

import { CatalogueHeader } from "@/components/admin/features/headers";
import { Sectioned } from "@/components/admin/features/section-tabs";
import { SyncFromCodeButton } from "@/components/admin/features/sync-button";
import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

export const metadata = { title: "Features · Catalogue · Corelith admin" };

/** Every feature the platform has, and how many workspaces have it on. */
export default async function CatalogueFeaturesPage() {
  const operator = await requireOperator();
  return (
    <AdminPage>
      <Sectioned>
        <CatalogueHeader actions={operatorCan(operator.role, "operator.manage") ? <SyncFromCodeButton /> : null} />
        <Suspense>
          <AdminList source="admin-catalogue-features" title="Features" />
        </Suspense>
      </Sectioned>
    </AdminPage>
  );
}
