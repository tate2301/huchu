import { PosCustomersView } from "@corelithzw/module-sell/components/portal/pos-customers-view";
import { PosPortalAuthGuard } from "@corelithzw/module-sell/components/portal/pos-auth-guard";

/** Was a redirect stub back to checkout. See `price-check/page.tsx`. */
export default async function PosPortalCustomersPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/customers">
      <PosCustomersView />
    </PosPortalAuthGuard>
  );
}
