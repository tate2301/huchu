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
    <div className="pos-terminal flex min-h-[100dvh] items-center justify-center p-4" style={{ background: "var(--surface-canvas)" }}>
      <PortalLoginForm
        portalTitle="Point of Sale"
        portalDescription="Sign in to continue."
        portalIcon={<ReceiptLong className="h-7 w-7" />}
        companyLabel={companyLabel}
        redirectTo={redirectTo}
        callbackUrl={callbackUrl}
        rememberMeEnabled={rememberMeEnabled}
        helpText="Use your standard company account."
      />
    </div>
  );
}
