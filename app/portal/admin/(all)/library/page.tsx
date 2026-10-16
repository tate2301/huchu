import { Suspense } from "react";

import { LibraryNewMenu } from "@/components/admin/library/new-menu";
import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

export const metadata = { title: "Library · Corelith admin" };

/** Corelith's library: reports, questions, insights, forms, templates and layouts, made once and published. */
export default async function LibraryPage() {
  const operator = await requireOperator();
  return (
    <AdminPage>
      <AdminPageHeader title="Library" actions={operatorCan(operator.role, "library.manage") ? <LibraryNewMenu /> : null} />
      <Suspense>
        <AdminList source="admin-library" title="Library" />
      </Suspense>
    </AdminPage>
  );
}
