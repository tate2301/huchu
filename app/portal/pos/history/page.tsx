import { PosPortalContent } from "@/components/retail/portal/pos-portal-content";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalHistoryPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/history"
      title="Sales History"
      description="Review posted sales, refunds, and voids."
    >
      <PosPortalContent initialView="history" />
    </PosPortalPageFrame>
  );
}
