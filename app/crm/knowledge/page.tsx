import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { KnowledgeList } from "@/components/crm/knowledge/knowledge-list";
import { authOptions } from "@/lib/auth";

/** CRM → Knowledge: the price lists and documents Vane answers and quotes from. */
export default async function CrmKnowledgePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <KnowledgeList />
    </CrmPage>
  );
}
