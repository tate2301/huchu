import { PosReportsView } from "@/components/retail/portal/pos-reports-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalReportsPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/reports">
      <PosReportsView />
    </PosPortalAuthGuard>
  );
}
