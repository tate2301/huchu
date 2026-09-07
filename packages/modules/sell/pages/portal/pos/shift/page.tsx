import { PosShiftView } from "../../../../components/portal/pos-shift-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalShiftPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/shift">
      <PosShiftView />
    </PosPortalAuthGuard>
  );
}
