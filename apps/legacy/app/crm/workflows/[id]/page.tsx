import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { WorkflowEditor } from "@corelithzw/module-crm/components/workflows/workflow-editor";
import { authOptions } from "@/lib/auth";

export default async function CrmWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="narrow">
      <WorkflowEditor workflowId={id} />
    </CrmPage>
  );
}
