import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { HealthPage } from "@/components/admin-portal/pages/health-page";

export default function AdminHealthRoute() {
  return (
    <AdminShell>
      <HealthPage />
    </AdminShell>
  );
}
