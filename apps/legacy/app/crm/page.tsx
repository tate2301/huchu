import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@/components/layout/page-chrome";
import { CrmOverview } from "@/components/crm/crm-overview";
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
