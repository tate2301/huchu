import { PosHeldView } from "../../../../components/portal/pos-held-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalHeldPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/held">
      <PosHeldView />
    </PosPortalAuthGuard>
  );
}
