import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { WorkflowEditor } from "@corelithzw/module-crm/components/workflows/workflow-editor";
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
