import { PosCheckoutView } from "@/components/retail/portal/pos-checkout-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos"
      title="Point of Sale"
      fillHeight
    >
      <PosCheckoutView />
    </PosPortalPageFrame>
  );
}
