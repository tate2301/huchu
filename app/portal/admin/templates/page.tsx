import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { TemplatesPage } from "@/components/admin-portal/pages/templates-page";

export default function AdminTemplatesRoute() {
  return (
    <AdminShell>
      <TemplatesPage />
    </AdminShell>
  );
}
