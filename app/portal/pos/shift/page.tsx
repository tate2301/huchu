import { PosShiftView } from "@/components/retail/portal/pos-shift-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalShiftPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/shift">
      <PosShiftView />
    </PosPortalAuthGuard>
  );
}
