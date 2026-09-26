import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { WorkflowRunRecordContent } from "@/components/crm/workflows/workflow-run-record-content";
import { authOptions } from "@/lib/auth";

/** One workflow run. Workflow activity links here. */
export default async function CrmWorkflowRunPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage width="detail">
      <WorkflowRunRecordContent runId={id} />
    </CrmPage>
  );
}
