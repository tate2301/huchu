import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CrmPage } from "@/components/crm/crm-page";
import { KnowledgeHome } from "@/components/crm/knowledge/knowledge-home";
import { authOptions } from "@/lib/auth";

/** CRM → Knowledge: everything the business knows (FAQs, facts, tips, prices, documents), and Vane answering from it. */
export default async function CrmKnowledgePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <Suspense>
        <KnowledgeHome />
      </Suspense>
    </CrmPage>
  );
}
