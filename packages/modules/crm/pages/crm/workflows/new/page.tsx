import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../../components/crm-page";
import { WorkflowEditor } from "../../../../components/workflows/workflow-editor";

export default async function NewCrmWorkflowPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <CrmPage width="narrow" title="New workflow" description="a trigger, then the steps it sets off">
      <WorkflowEditor workflowId={null} />
    </CrmPage>
  );
}
