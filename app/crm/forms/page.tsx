import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { IntakeFormsRegister } from "@/components/crm/intake-forms/intake-forms-register";
import { PageChrome } from "@/components/layout/page-chrome";
import { authOptions } from "@/lib/auth";

export default async function CrmFormsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Intake forms" />
      <IntakeFormsRegister />
    </CrmPage>
  );
}
