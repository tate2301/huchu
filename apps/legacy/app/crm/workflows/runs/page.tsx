import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { WorkflowRunsContent } from "@/components/crm/workflows/workflow-runs-content";
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
