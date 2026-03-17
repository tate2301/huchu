"use client";

import { Users } from "@/lib/icons";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

export function StudentPortalLoginClient({
  companyLabel,
  callbackUrl,
}: {
  companyLabel: string;
  callbackUrl?: string;
}) {
  return (
    <PortalLoginForm
      portalTitle="Student Portal"
      portalDescription="Access your enrollment, results, and school information."
      portalIcon={<Users className="h-7 w-7" />}
      companyLabel={companyLabel}
      redirectTo="/portal/student"
      callbackUrl={callbackUrl}
      helpText="Contact your school administration if you need login credentials."
    />
  );
}
