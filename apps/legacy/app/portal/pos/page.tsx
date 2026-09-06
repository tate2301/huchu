import { PosCheckoutView } from "@corelithzw/module-sell/components/portal/pos-checkout-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos">
      <PosCheckoutView />
    </PosPortalAuthGuard>
  );
}
