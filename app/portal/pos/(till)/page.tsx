import { PosCheckoutView } from "@/components/retail/portal/pos-checkout-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos">
      <PosCheckoutView />
    </PosPortalAuthGuard>
  );
}
