import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { ClientDetailsPage } from "@/components/admin-portal/pages/client-details-page";

export default async function ClientDetailsRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return (
    <AdminShell activeCompanyId={companyId}>
      <ClientDetailsPage companyId={companyId} />
    </AdminShell>
  );
}
