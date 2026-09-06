import { PosOverviewView } from "@corelithzw/module-sell/components/portal/pos-overview-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

/** Was a redirect stub back to checkout. See `price-check/page.tsx`. */
export default async function PosPortalOverviewPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/overview">
      <PosOverviewView />
    </PosPortalAuthGuard>
  );
}
