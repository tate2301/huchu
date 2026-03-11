import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { AddonsPage } from "@/components/admin-portal/pages/addons-page";

export default function AdminAddonsRoute() {
  return (
    <AdminShell>
      <AddonsPage />
    </AdminShell>
  );
}
