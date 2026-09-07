import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { SupportAccessPage } from "@/components/admin-portal/pages/support-access-page";

type Params = Promise<{ companyId: string }>;

export default async function AdminCompanySupportAccessRoute({
  params,
}: {
  params: Params;
}) {
  const { companyId } = await params;

  return (
    <AdminShell activeCompanyId={companyId}>
      <SupportAccessPage companyId={companyId} />
    </AdminShell>
  );
}
