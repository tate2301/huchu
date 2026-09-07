import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { CompaniesPage } from "@/components/admin-portal/pages/companies-page";
import { requireAdminPortalSession } from "@corelithzw/platform/admin-portal/server";

export default async function AdminClientsRoute() {
  const session = await requireAdminPortalSession();
  return (
    <AdminShell>
      <CompaniesPage actorEmail={session.user.email ?? "superuser"} />
    </AdminShell>
  );
}
