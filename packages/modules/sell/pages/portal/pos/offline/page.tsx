import { PosOfflineQueueView } from "../../../../components/portal/pos-offline-queue-view";
import { PosPortalAuthGuard } from "../../../../components/portal/pos-auth-guard";

export default async function PosPortalOfflineQueuePage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/offline">
      <PosOfflineQueueView />
    </PosPortalAuthGuard>
  );
}
