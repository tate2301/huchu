import { PosHistoryView } from "@corelithzw/module-sell/components/portal/pos-history-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalHistoryPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/history">
      <PosHistoryView />
    </PosPortalAuthGuard>
  );
}
