import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmInsightsContent } from "../../../components/crm-insights-content";

export default async function CrmInsightsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Insights" />
      <CrmInsightsContent />
    </CrmPage>
  );
}
