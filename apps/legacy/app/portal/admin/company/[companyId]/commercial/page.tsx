import { CommercialCenterPage } from "@/components/admin-portal/pages/commercial-center-page";
import { AdminShell } from "@/components/admin-portal/shell/admin-shell";

export default async function CompanyCommercialCenterRoute({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { companyId } = await params;
  const { view } = await searchParams;

  return (
    <AdminShell activeCompanyId={companyId}>
      <CommercialCenterPage companyId={companyId} initialView={view} />
    </AdminShell>
  );
}
