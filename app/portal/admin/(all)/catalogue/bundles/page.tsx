import Link from "next/link";
import { Suspense } from "react";

import { CatalogueHeader } from "@/components/admin/features/headers";
import { Sectioned } from "@/components/admin/features/section-tabs";
import { SyncFromCodeButton } from "@/components/admin/features/sync-button";
import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage } from "@/components/admin/page-header";
import { Plus } from "@/lib/icons";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

export const metadata = { title: "Bundles · Catalogue · Corelith admin" };

/** Every bundle: the code's, and the ones made here. */
export default async function CatalogueBundlesPage() {
  const operator = await requireOperator();
  const owner = operatorCan(operator.role, "operator.manage");
  return (
    <AdminPage>
      <Sectioned>
        <CatalogueHeader
          actions={
            owner ? (
              <>
                <SyncFromCodeButton />
                <Link href="/admin/catalogue/bundles?sheet=catalogue-bundle" className="btn btn-primary no-underline">
                  <Plus aria-hidden="true" />
                  New bundle
                </Link>
              </>
            ) : null
          }
        />
        <Suspense>
          <AdminList source="admin-catalogue-bundles" title="Bundles" />
        </Suspense>
      </Sectioned>
    </AdminPage>
  );
}
