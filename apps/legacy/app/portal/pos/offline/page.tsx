import { PosOfflineQueueView } from "@/components/retail/portal/pos-offline-queue-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

export default async function PosPortalOfflineQueuePage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/offline">
      <PosOfflineQueueView />
    </PosPortalAuthGuard>
  );
}
