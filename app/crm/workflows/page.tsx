import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { WorkflowsContent } from "@/components/crm/workflows/workflows-content";
import { authOptions } from "@/lib/auth";

export default async function CrmWorkflowsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Workflows" description="what runs by itself, and what sets it off">
      <WorkflowsContent />
    </CrmPage>
  );
}
