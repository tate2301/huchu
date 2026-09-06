import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmInsightsContent } from "@/components/crm/crm-insights-content";
import { authOptions } from "@/lib/auth";

export default async function CrmInsightsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Insights" />
      <CrmInsightsContent />
    </CrmPage>
  );
}
