import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { KnowledgeDoc } from "@/components/crm/knowledge/knowledge-doc";
import { authOptions } from "@/lib/auth";

/** One document in the knowledge base: its prices and its words. */
export default async function CrmKnowledgeDocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <KnowledgeDoc id={id} />
    </CrmPage>
  );
}
