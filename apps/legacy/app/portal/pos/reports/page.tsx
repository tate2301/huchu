import { PosReportsView } from "@corelithzw/module-sell/components/portal/pos-reports-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalReportsPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/reports">
      <PosReportsView />
    </PosPortalAuthGuard>
  );
}
