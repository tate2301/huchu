import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../components/crm-page";
import { WorkflowsContent } from "../../../components/workflows/workflows-content";

export default async function CrmWorkflowsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Workflows" description="what runs by itself, and what sets it off">
      <WorkflowsContent />
    </CrmPage>
  );
}
