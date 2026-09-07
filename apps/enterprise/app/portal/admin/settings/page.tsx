import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { SettingsPage } from "@/components/admin-portal/pages/settings-page";

export default function AdminSettingsRoute() {
  return (
    <AdminShell>
      <SettingsPage />
    </AdminShell>
  );
}
