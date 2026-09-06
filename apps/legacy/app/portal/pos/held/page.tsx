import { PosHeldView } from "@corelithzw/module-sell/components/portal/pos-held-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalHeldPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/held">
      <PosHeldView />
    </PosPortalAuthGuard>
  );
}
