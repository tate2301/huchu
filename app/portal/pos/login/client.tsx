"use client";

import { ReceiptLong } from "@/lib/icons";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

export function PosPortalLoginClient({
  companyLabel,
  callbackUrl,
  rememberMeEnabled,
}: {
  companyLabel: string;
  callbackUrl?: string;
  rememberMeEnabled?: boolean;
}) {
  return (
    <PortalLoginForm
      portalTitle="Point of Sale"
      portalDescription="Sign in to sell and manage your shift."
      portalIcon={<ReceiptLong className="h-7 w-7" />}
      companyLabel={companyLabel}
      redirectTo="/portal/pos"
      callbackUrl={callbackUrl}
      rememberMeEnabled={rememberMeEnabled}
      helpText="Contact your manager if you need cashier access."
    />
  );
}
