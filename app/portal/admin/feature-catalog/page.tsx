import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { FeatureCatalogPage } from "@/components/admin-portal/pages/feature-catalog-page";

export default function AdminFeatureCatalogRoute() {
  return (
    <AdminShell>
      <FeatureCatalogPage />
    </AdminShell>
  );
}
