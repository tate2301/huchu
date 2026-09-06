import { IdentityHubPage } from "@/components/admin-portal/pages/identity-hub-page";
import { AdminShell } from "@/components/admin-portal/shell/admin-shell";

export default async function CompanyIdentityRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  return (
    <AdminShell activeCompanyId={companyId}>
      <IdentityHubPage companyId={companyId} />
    </AdminShell>
  );
}
