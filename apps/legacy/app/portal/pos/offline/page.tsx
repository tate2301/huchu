import { PosOfflineQueueView } from "@corelithzw/module-sell/components/portal/pos-offline-queue-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

export default async function PosPortalOfflineQueuePage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/offline">
      <PosOfflineQueueView />
    </PosPortalAuthGuard>
  );
}
