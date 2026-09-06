import { PosTillActivityView } from "@/components/retail/portal/pos-till-activity-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalActivityPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/activity">
      <PosTillActivityView />
    </PosPortalAuthGuard>
  );
}
