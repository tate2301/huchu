import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../components/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmOverview } from "../../components/crm-overview";

export default async function CrmDashboardPage() {
  const session = await getCurrentAuthSession();
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
