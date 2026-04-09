import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";
import { PosPriceCheckView } from "@/components/retail/portal/pos-price-check-view";

export default async function PosPortalPriceCheckPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/price-check"
      title="Price Check"
    >
      <PosPriceCheckView />
    </PosPortalPageFrame>
  );
}
