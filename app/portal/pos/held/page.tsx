import { PosPortalContent } from "@/components/retail/portal/pos-portal-content";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalHeldPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/held"
      title="Held Carts"
      description="Recall parked baskets without losing register flow."
    >
      <PosPortalContent initialView="held" />
    </PosPortalPageFrame>
  );
}
