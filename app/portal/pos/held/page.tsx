import { PosHeldView } from "@/components/retail/portal/pos-held-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalHeldPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/held">
      <PosHeldView />
    </PosPortalAuthGuard>
  );
}
