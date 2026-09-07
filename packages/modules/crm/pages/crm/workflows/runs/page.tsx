import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../../components/crm-page";
import { WorkflowRunsContent } from "../../../../components/workflows/workflow-runs-content";

export default async function CrmWorkflowRunsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Workflow runs" description="every run, and what it did">
      <WorkflowRunsContent />
    </CrmPage>
  );
}
