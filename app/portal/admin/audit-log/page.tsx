import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { AuditLogPage } from "@/components/admin-portal/pages/audit-log-page";

export default function AdminAuditLogRoute() {
  return (
    <AdminShell>
      <AuditLogPage />
    </AdminShell>
  );
}
