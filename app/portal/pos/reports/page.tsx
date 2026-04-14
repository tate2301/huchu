import { PosReportsView } from "@/components/retail/portal/pos-reports-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalReportsPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/reports"
      title="Reports"
      description="Your sales at a glance"
    >
      <PosReportsView />
    </PosPortalPageFrame>
  );
}
