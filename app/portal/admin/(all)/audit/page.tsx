import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";

export const metadata = { title: "Audit log · Corelith admin" };

export default async function AuditLogPage() {
  await requireOperator();
  return (
    <AdminPage>
      <AdminPageHeader title="Audit log" />
      <p className="-mt-2 mb-3 t-body-sm text-[var(--text-muted)]">
        Everything recorded in every workspace and in this portal, newest first. Each line is chained to the one before it in its workspace.
      </p>
      <Suspense>
        <AdminList source="admin-audit" title="Audit log" />
      </Suspense>
    </AdminPage>
  );
}
