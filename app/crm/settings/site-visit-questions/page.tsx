import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { QuestionSetsContent } from "@/components/crm/settings/question-sets-content";
import { authOptions } from "@/lib/auth";

/**
 * Editing the questions a rep is asked on site.
 *
 * Seeding made these questions data; this is what makes them editable. Before
 * it, correcting one of the 152 imported questions meant a database write.
 */
export default async function CrmSiteVisitQuestionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage
      title="Site visit questions"
      description="what a rep is asked on site, per product"
    >
      <QuestionSetsContent />
    </CrmPage>
  );
}
