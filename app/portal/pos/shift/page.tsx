import { PosPortalContent } from "@/components/retail/portal/pos-portal-content";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalShiftPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/shift"
      title="Shift Management"
      description="Open, review, and close tills with cash-up controls."
    >
      <PosPortalContent initialView="shift" />
    </PosPortalPageFrame>
  );
}
