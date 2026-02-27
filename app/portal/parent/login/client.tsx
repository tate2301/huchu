"use client";

import { Home } from "@/lib/icons";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

export function ParentPortalLoginClient({
  companyLabel,
}: {
  companyLabel: string;
}) {
  return (
    <PortalLoginForm
      portalTitle="Guardian Portal"
      portalDescription="View your children's progress, fees, and school communications."
      portalIcon={<Home className="h-7 w-7" />}
      companyLabel={companyLabel}
      redirectTo="/portal/parent"
      helpText="Contact the school to request guardian portal access."
    />
  );
}
