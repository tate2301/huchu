import { PosCustomersView } from "@/components/retail/portal/pos-customers-view";
import { PosPortalPageFrame } from "@/components/retail/portal/pos-portal-page-frame";

export default async function PosPortalCustomersPage() {
  return (
    <PosPortalPageFrame
      pathname="/portal/pos/customers"
      title="Customers"
    >
      <PosCustomersView />
    </PosPortalPageFrame>
  );
}
