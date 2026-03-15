import { IdentityHubPage } from "@/components/admin-portal/pages/identity-hub-page";
import { AdminShell } from "@/components/admin-portal/shell/admin-shell";

export default function AdminIdentityRoute() {
  return (
    <AdminShell>
      <IdentityHubPage />
    </AdminShell>
  );
}
