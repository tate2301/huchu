import { PosHistoryView } from "@/components/retail/portal/pos-history-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalHistoryPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/history"
      title="Sales History"
    >
      <PosHistoryView />
    </PosPortalPageFrame>
  );
}
