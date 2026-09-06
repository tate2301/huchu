import { PosTillSettingsView } from "../../../../components/portal/pos-till-settings-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalTillSettingsPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/settings">
      <PosTillSettingsView />
    </PosPortalAuthGuard>
  );
}
