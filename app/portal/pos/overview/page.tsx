import { PosOverviewView } from "@/components/retail/portal/pos-overview-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalOverviewPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/overview"
      title="POS Overview"
      description="Monitor shift health and jump into register tasks quickly."
    >
      <PosOverviewView />
    </PosPortalPageFrame>
  );
}
