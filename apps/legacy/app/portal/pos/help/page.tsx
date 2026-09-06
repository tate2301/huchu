import { PosHelpView } from "@/components/retail/portal/pos-help-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalHelpPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/help">
      <PosHelpView />
    </PosPortalAuthGuard>
  );
}
