"use client";

import { ReceiptLong } from "@/lib/icons";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

export function PosPortalLoginClient({
  companyLabel,
}: {
  companyLabel: string;
}) {
  return (
    <PortalLoginForm
      portalTitle="Point of Sale"
      portalDescription="Sign in to process sales and manage transactions."
      portalIcon={<ReceiptLong className="h-7 w-7" />}
      companyLabel={companyLabel}
      redirectTo="/portal/pos"
      helpText="Contact your store manager if you need cashier access."
    />
  );
}
