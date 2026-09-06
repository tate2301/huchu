import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { OperationsPage } from "@/components/admin-portal/pages/operations-page";
import { requireAdminPortalSession } from "@/lib/admin-portal/server";

export default async function AdminAdvancedRoute() {
  const session = await requireAdminPortalSession();

  return (
    <AdminShell>
      <OperationsPage
        title="Advanced tools"
        actorEmail={session.user.email ?? "superuser"}
        modules={["org", "site", "subscription", "feature", "admin", "user", "audit", "support", "runbook", "health", "contract", "search"]}
      />
    </AdminShell>
  );
}
