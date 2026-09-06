import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmOverview } from "@corelithzw/module-crm/components/crm-overview";
import { authOptions } from "@/lib/auth";

export default async function CrmDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage
      title="Overview"
      description="the state of the book today"
    >
      <PageChrome title="CRM" />
      <CrmOverview />
    </CrmPage>
  );
}
