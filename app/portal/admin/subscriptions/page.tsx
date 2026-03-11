import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { SubscriptionsPage } from "@/components/admin-portal/pages/subscriptions-page";

export default function AdminSubscriptionsRoute() {
  return (
    <AdminShell>
      <SubscriptionsPage />
    </AdminShell>
  );
}
