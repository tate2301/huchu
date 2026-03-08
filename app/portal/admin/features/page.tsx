import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { OperationsPage } from "@/components/admin-portal/pages/operations-page";
import { requireAdminPortalSession } from "@/lib/admin-portal/server";

export default async function AdminFeaturesRoute() {
  const session = await requireAdminPortalSession();
  return (
    <AdminShell>
      <OperationsPage
        title="Platform features"
        actorEmail={session.user.email ?? "superuser"}
        modules={["feature", "subscription"]}
      />
    </AdminShell>
  );
}
