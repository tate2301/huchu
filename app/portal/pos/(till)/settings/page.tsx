import { PosTillSettingsView } from "@/components/retail/portal/pos-till-settings-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalTillSettingsPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/settings">
      <PosTillSettingsView />
    </PosPortalAuthGuard>
  );
}
