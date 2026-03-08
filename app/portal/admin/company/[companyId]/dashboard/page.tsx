import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { DashboardPage } from "@/components/admin-portal/pages/dashboard-page";

export default async function CompanyDashboardRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return (
    <AdminShell activeCompanyId={companyId}>
      <DashboardPage companyId={companyId} />
    </AdminShell>
  );
}
