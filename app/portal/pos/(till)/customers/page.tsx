import { PosCustomersView } from "@/components/retail/portal/pos-customers-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

/** Was a redirect stub back to checkout. See `price-check/page.tsx`. */
export default async function PosPortalCustomersPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/customers">
      <PosCustomersView />
    </PosPortalAuthGuard>
  );
}
