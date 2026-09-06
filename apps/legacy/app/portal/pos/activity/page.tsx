import { PosTillActivityView } from "@corelithzw/module-sell/components/portal/pos-till-activity-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalActivityPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/activity">
      <PosTillActivityView />
    </PosPortalAuthGuard>
  );
}
