import { PosShiftView } from "@/components/retail/portal/pos-shift-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalShiftPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/shift"
      title="Shift Management"
      description="Open, review, and close tills with cash-up controls."
    >
      <PosShiftView />
    </PosPortalPageFrame>
  );
}
