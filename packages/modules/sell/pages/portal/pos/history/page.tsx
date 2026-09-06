import { PosHistoryView } from "../../../../components/portal/pos-history-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalHistoryPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/history">
      <PosHistoryView />
    </PosPortalAuthGuard>
  );
}
