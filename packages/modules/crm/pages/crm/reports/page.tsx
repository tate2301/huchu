import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { ReportsContent } from "../../../components/reports/reports-content";

export default async function CrmReportsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Sales reports" />
      <ReportsContent />
    </CrmPage>
  );
}
