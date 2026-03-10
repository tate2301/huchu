import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { CompaniesPage } from "@/components/admin-portal/pages/companies-page";

export default function AdminClientsRoute() {
  return (
    <AdminShell>
      <CompaniesPage />
    </AdminShell>
  );
}
