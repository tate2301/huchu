import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { WorkflowEditor } from "@/components/crm/workflows/workflow-editor";
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
