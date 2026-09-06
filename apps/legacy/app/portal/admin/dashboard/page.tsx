import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { DashboardPage } from "@/components/admin-portal/pages/dashboard-page";

export default function AdminDashboardRoute() {
  return (
    <AdminShell>
      <DashboardPage />
    </AdminShell>
  );
}
