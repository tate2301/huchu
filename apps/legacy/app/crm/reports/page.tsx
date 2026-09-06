import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { ReportsContent } from "@corelithzw/module-crm/components/reports/reports-content";
import { authOptions } from "@/lib/auth";

export default async function CrmReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Sales reports" />
      <ReportsContent />
    </CrmPage>
  );
}
