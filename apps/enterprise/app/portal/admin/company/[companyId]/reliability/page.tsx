import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { ReliabilityClusterPage } from "@/components/admin-portal/pages/reliability-cluster-page";

type Params = Promise<{ companyId: string }>;

export default async function AdminCompanyReliabilityRoute({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ view?: string }>;
}) {
  const { companyId } = await params;
  const { view } = await searchParams;

  return (
    <AdminShell activeCompanyId={companyId}>
      <ReliabilityClusterPage companyId={companyId} initialView={view} />
    </AdminShell>
  );
}
