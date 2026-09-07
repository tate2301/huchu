import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { SupportAccessPage } from "@/components/admin-portal/pages/support-access-page";

export default function AdminSupportAccessRoute() {
  return (
    <AdminShell>
      <SupportAccessPage />
    </AdminShell>
  );
}
