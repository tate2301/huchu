import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";

import { PipelineWorkspace } from "@/components/crm/records/pipeline-workspace";
import { authOptions } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmDealsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  // Landing here means "show me a deal pipeline"; the menu can walk back to
  // leads without a navigation.
  const pipeline = typeof params.pipeline === "string" ? params.pipeline : "deals";
  return (
    <CrmPage
      title="Deals"
      description="what is in the pipeline, and what it is worth"
    >
      <PipelineWorkspace initial={pipeline} openCreate={params.new === "1"} />
    </CrmPage>
  );
}
