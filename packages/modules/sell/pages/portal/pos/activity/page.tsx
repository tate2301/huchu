import { PosTillActivityView } from "../../../../components/portal/pos-till-activity-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalActivityPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/activity">
      <PosTillActivityView />
    </PosPortalAuthGuard>
  );
}
