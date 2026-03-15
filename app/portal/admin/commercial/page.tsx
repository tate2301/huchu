import { CommercialCenterPage } from "@/components/admin-portal/pages/commercial-center-page";
import { AdminShell } from "@/components/admin-portal/shell/admin-shell";

export default async function AdminCommercialCenterRoute({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;

  return (
    <AdminShell>
      <CommercialCenterPage initialView={view} />
    </AdminShell>
  );
}
