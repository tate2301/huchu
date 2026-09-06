import { PosHelpView } from "@corelithzw/module-sell/components/portal/pos-help-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalHelpPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/help">
      <PosHelpView />
    </PosPortalAuthGuard>
  );
}
