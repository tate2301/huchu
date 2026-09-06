import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { WorkflowRunsContent } from "@corelithzw/module-crm/components/workflows/workflow-runs-content";
import { authOptions } from "@/lib/auth";

export default async function CrmWorkflowRunsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Workflow runs" description="every run, and what it did">
      <WorkflowRunsContent />
    </CrmPage>
  );
}
