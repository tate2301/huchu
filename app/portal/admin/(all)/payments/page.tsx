import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";

export const metadata = { title: "Payments · Corelith admin" };

export default async function PaymentsPage() {
  await requireOperator();
  return (
    <AdminPage>
      <AdminPageHeader title="Payments" />
      <Suspense>
        <AdminList source="admin-payments" title="Payments" />
      </Suspense>
    </AdminPage>
  );
}
