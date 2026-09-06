import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@/components/layout/page-chrome";
import { CrmFormsContent } from "@/components/crm/crm-forms-content";
import { authOptions } from "@/lib/auth";

export default async function CrmFormsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Intake forms" />
      <CrmFormsContent />
    </CrmPage>
  );
}
