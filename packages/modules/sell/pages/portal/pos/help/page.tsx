import { PosHelpView } from "../../../../components/portal/pos-help-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalHelpPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/help">
      <PosHelpView />
    </PosPortalAuthGuard>
  );
}
