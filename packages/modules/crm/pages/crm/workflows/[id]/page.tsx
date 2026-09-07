import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../../components/crm-page";
import { WorkflowEditor } from "../../../../components/workflows/workflow-editor";

export default async function CrmWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="narrow">
      <WorkflowEditor workflowId={id} />
    </CrmPage>
  );
}
