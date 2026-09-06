import { PosShiftView } from "@corelithzw/module-sell/components/portal/pos-shift-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalShiftPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/shift">
      <PosShiftView />
    </PosPortalAuthGuard>
  );
}
