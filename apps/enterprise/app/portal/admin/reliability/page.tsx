import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { ReliabilityClusterPage } from "@/components/admin-portal/pages/reliability-cluster-page";

export default async function AdminReliabilityRoute({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;

  return (
    <AdminShell>
      <ReliabilityClusterPage initialView={view} />
    </AdminShell>
  );
}
