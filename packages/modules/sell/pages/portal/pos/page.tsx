import { PosCheckoutView } from "../../../components/portal/pos-checkout-view";
import { PosPortalAuthGuard } from "../../../components/portal/pos-auth-guard";

export default async function PosPortalPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos">
      <PosCheckoutView />
    </PosPortalAuthGuard>
  );
}
