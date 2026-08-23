import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { WorkflowEditor } from "@/components/crm/workflows/workflow-editor";
import { authOptions } from "@/lib/auth";

export default async function NewCrmWorkflowPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage width="narrow" title="New workflow" description="a trigger, then the steps it sets off">
      <WorkflowEditor workflowId={null} />
    </CrmPage>
  );
}
