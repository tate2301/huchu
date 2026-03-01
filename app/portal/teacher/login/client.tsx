"use client";

import { ManageAccounts } from "@/lib/icons";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

export function TeacherPortalLoginClient({
  companyLabel,
}: {
  companyLabel: string;
}) {
  return (
    <PortalLoginForm
      portalTitle="Teacher Portal"
      portalDescription="Access classes, attendance, marks, and moderation workflows."
      portalIcon={<ManageAccounts className="h-7 w-7" />}
      companyLabel={companyLabel}
      redirectTo="/portal/teacher"
      helpText="Contact your school administrator if you need teacher portal access."
    />
  );
}
