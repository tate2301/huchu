"use client";

import { ReceiptLong } from "@/lib/icons";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

export function PosPortalLoginClient({
  companyLabel,
  callbackUrl,
  redirectTo,
  rememberMeEnabled,
}: {
  companyLabel: string;
  callbackUrl?: string;
  redirectTo: string;
  rememberMeEnabled?: boolean;
}) {
  return (
    <PortalLoginForm
      portalTitle="Point of Sale"
      portalDescription="Use your retail account to open checkout, manage the floor, and keep your shift moving."
      portalIcon={<ReceiptLong className="h-7 w-7" />}
      companyLabel={companyLabel}
      redirectTo={redirectTo}
      callbackUrl={callbackUrl}
      rememberMeEnabled={rememberMeEnabled}
      helpText="Cashiers, store leads, and managers can sign in here with their normal company credentials."
    />
  );
}
