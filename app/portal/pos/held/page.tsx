import { PosHeldView } from "@/components/retail/portal/pos-held-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalHeldPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/held"
      title="Held Carts"
      description="Recall parked baskets without losing register flow."
    >
      <PosHeldView />
    </PosPortalPageFrame>
  );
}
