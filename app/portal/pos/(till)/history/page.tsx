import { PosHistoryView } from "@/components/retail/portal/pos-history-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalHistoryPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/history">
      <PosHistoryView />
    </PosPortalAuthGuard>
  );
}
