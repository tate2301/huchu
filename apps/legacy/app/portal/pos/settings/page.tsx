import { PosTillSettingsView } from "@corelithzw/module-sell/components/portal/pos-till-settings-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalTillSettingsPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/settings">
      <PosTillSettingsView />
    </PosPortalAuthGuard>
  );
}
