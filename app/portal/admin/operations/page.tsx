import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { OperationsPage } from "@/components/admin-portal/pages/operations-page";
import { requireAdminPortalSession } from "@/lib/admin-portal/server";

export default async function AdminOperationsRoute() {
  const session = await requireAdminPortalSession();
  return (
    <AdminShell>
      <OperationsPage
        title="Platform operations"
        actorEmail={session.user.email ?? "superuser"}
      />
    </AdminShell>
  );
}
